#!/usr/bin/env python3
"""Build county GeoJSON + compact per-SOC wage files from OFLC 2026-27 exports.

Reads:
  raw/ALC_Export.csv
  raw/Geography.csv
  raw/oes_soc_occs.csv
  raw/xwalk_plus.csv
  Census cb_2023_us_county_5m shapefile (path via --shapefile)

Writes:
  public/counties.geojson
  public/data/geoids.json
  public/data/soc_codes.json
  public/data/soc/<SOC>.json   # parallel array of [L1,L2,L3,L4] hourly cents, or null
  public/data/meta.json
"""

from __future__ import annotations

import argparse
import csv
import json
import re
import sys
import unicodedata
from collections import defaultdict
from pathlib import Path

try:
    import shapefile
except ImportError:
    sys.exit("pyshp is required. Run: pip install -r scripts/requirements.txt")

HOURS_PER_YEAR = 2080
COORD_PRECISION = 4
INCLUDED_STATES = {
    "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DC", "DE", "FL", "GA", "HI",
    "IA", "ID", "IL", "IN", "KS", "KY", "LA", "MA", "MD", "ME", "MI", "MN",
    "MO", "MS", "MT", "NC", "ND", "NE", "NH", "NJ", "NM", "NV", "NY", "OH",
    "OK", "OR", "PA", "PR", "RI", "SC", "SD", "TN", "TX", "UT", "VA", "VT",
    "WA", "WI", "WV", "WY",
}


def strip_accents(value: str) -> str:
    decomposed = unicodedata.normalize("NFKD", value)
    return "".join(ch for ch in decomposed if not unicodedata.combining(ch))


def normalize(value: str) -> str:
    value = strip_accents(value).lower().replace(".", "")
    value = value.replace("ñ", "n")
    value = re.sub(r"\s+", " ", value).strip()
    return value


def name_keys(text: str) -> set[str]:
    n = normalize(text)
    keys = {n}
    suffixes = (
        " planning region",
        " city and borough",
        " census area",
        " municipality",
        " municipio",
        " parish",
        " county",
        " borough",
        " city",
    )
    for suffix in suffixes:
        if n.endswith(suffix):
            keys.add(n[: -len(suffix)].strip())
    return {k for k in keys if k}


def round_coords(coords, ndigits=COORD_PRECISION):
    if not coords:
        return coords
    if isinstance(coords[0], (int, float)):
        return [round(float(coords[0]), ndigits), round(float(coords[1]), ndigits)]
    return [round_coords(c, ndigits) for c in coords]


def to_hourly(value: float, label: str) -> float:
    if label == "Annual Wage" or value > 200:
        return value / HOURS_PER_YEAR
    return value


def parse_levels(row: dict) -> list[int] | None:
    label = (row.get("Label") or "").strip()
    if label == "No Leveled Wage":
        return None
    hourly = []
    for key in ("Level1", "Level2", "Level3", "Level4"):
        raw = (row.get(key) or "").strip()
        if not raw:
            hourly.append(None)
            continue
        try:
            value = float(raw)
        except ValueError:
            hourly.append(None)
            continue
        hourly.append(to_hourly(value, label))
    if not any(v is not None for v in hourly):
        return None
    cents = []
    for value in hourly:
        if value is None:
            cents.append(None)
        else:
            cents.append(int(round(value * 100)))
    return cents


def load_shapefile(path: Path) -> list[dict]:
    reader = shapefile.Reader(str(path))
    features = []
    for sr in reader.iterShapeRecords():
        props = sr.record.as_dict()
        st = props.get("STUSPS")
        if st not in INCLUDED_STATES:
            continue
        geom = sr.shape.__geo_interface__
        geom = {
            "type": geom["type"],
            "coordinates": round_coords(geom["coordinates"]),
        }
        features.append(
            {
                "type": "Feature",
                "properties": {
                    "STATEFP": props["STATEFP"],
                    "COUNTYFP": props["COUNTYFP"],
                    "GEOID": props["GEOID"],
                    "NAME": props["NAME"],
                    "NAMELSAD": props["NAMELSAD"],
                    "STUSPS": props["STUSPS"],
                    "LSAD": props["LSAD"],
                },
                "geometry": geom,
            }
        )
    return features


def match_geography(features: list[dict], geography_path: Path):
    by_state: dict[str, list[dict]] = defaultdict(list)
    for feature in features:
        props = feature["properties"]
        keys = name_keys(props["NAMELSAD"]) | name_keys(props["NAME"])
        by_state[props["STUSPS"]].append((keys, props["GEOID"], props["NAMELSAD"]))

    area_to_geoids: dict[str, list[str]] = defaultdict(list)
    unmatched = []
    seen_pairs = set()

    with geography_path.open(newline="", encoding="utf-8-sig") as handle:
        for row in csv.DictReader(handle):
            state = row["StateAb"]
            if state not in INCLUDED_STATES:
                continue
            geo_keys = name_keys(row["CountyTownName"])
            match = None
            for keys, geoid, namelsad in by_state.get(state, []):
                if keys & geo_keys:
                    match = geoid
                    break
            if not match:
                unmatched.append(f"{state}|{row['CountyTownName']}|area={row['Area']}")
                continue
            pair = (row["Area"], match)
            if pair not in seen_pairs:
                area_to_geoids[row["Area"]].append(match)
                seen_pairs.add(pair)

    return area_to_geoids, unmatched


def build_soc_codes(oes_path: Path, xwalk_path: Path) -> list[dict]:
    titles = {}
    with oes_path.open(newline="", encoding="utf-8-sig") as handle:
        for row in csv.DictReader(handle):
            titles[row["soccode"]] = row["Title"]

    options = []
    seen = set()
    with xwalk_path.open(newline="", encoding="utf-8-sig") as handle:
        for row in csv.DictReader(handle):
            parent = row["OES_SOCCODE"]
            code = row["OnetCode"] or f"{parent}.00"
            title = row["ONetTitle"] or row["OES_SOCTITLE"] or titles.get(parent, parent)
            if code in seen:
                continue
            seen.add(code)
            options.append({"code": code, "parent": parent, "title": title})

    for parent, title in titles.items():
        dotted = f"{parent}.00"
        if dotted not in seen and parent not in seen:
            options.append({"code": dotted, "parent": parent, "title": title})
            seen.add(dotted)

    options.sort(key=lambda item: (item["parent"], item["code"]))
    return options


def process_alc(alc_path: Path, area_to_geoids: dict[str, list[str]], geoid_index: dict[str, int]):
    """Return {soc: list aligned to geoid_index} of wage cents or None."""
    n_geoids = len(geoid_index)
    tables: dict[str, list] = {}
    specificity: dict[str, list[int]] = {}

    with alc_path.open(newline="", encoding="utf-8-sig") as handle:
        for row in csv.DictReader(handle):
            geoids = area_to_geoids.get(row["Area"])
            if not geoids:
                continue
            wages = parse_levels(row)
            if not wages:
                continue
            soc = row["SocCode"]
            try:
                geo_lvl = int(row.get("GeoLvl") or 99)
            except ValueError:
                geo_lvl = 99
            table = tables.get(soc)
            if table is None:
                table = [None] * n_geoids
                tables[soc] = table
                specificity[soc] = [99] * n_geoids
            spec = specificity[soc]
            for geoid in geoids:
                idx = geoid_index.get(geoid)
                if idx is None:
                    continue
                if spec[idx] <= geo_lvl and table[idx] is not None:
                    continue
                table[idx] = wages
                spec[idx] = geo_lvl

    return tables


def write_json(path: Path, payload, pretty=False):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        if pretty:
            json.dump(payload, handle, indent=2)
            handle.write("\n")
        else:
            json.dump(payload, handle, separators=(",", ":"))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--root",
        type=Path,
        default=Path(__file__).resolve().parents[1],
    )
    parser.add_argument(
        "--shapefile",
        type=Path,
        default=Path("/tmp/census_county/cb_2023_us_county_5m"),
    )
    args = parser.parse_args()
    root = args.root
    raw = root / "raw"
    public = root / "public"

    print("Loading shapefile…")
    features = load_shapefile(args.shapefile)
    features.sort(key=lambda f: f["properties"]["GEOID"])
    print(f"  {len(features)} county-equivalent features")

    geoids = [f["properties"]["GEOID"] for f in features]
    geoid_index = {geoid: i for i, geoid in enumerate(geoids)}

    print("Matching OFLC geography to Census GEOIDs…")
    area_to_geoids, unmatched = match_geography(features, raw / "Geography.csv")
    print(f"  areas mapped: {len(area_to_geoids)}")
    print(f"  unmatched geography rows: {len(unmatched)}")
    if unmatched:
        preview = "\n    ".join(unmatched[:15])
        print(f"  sample unmatched:\n    {preview}")

    print("Processing ALC wages…")
    tables = process_alc(raw / "ALC_Export.csv", area_to_geoids, geoid_index)
    print(f"  occupations: {len(tables)}")

    print("Writing GeoJSON and indexes…")
    write_json(
        public / "counties.geojson",
        {"type": "FeatureCollection", "features": features},
    )
    write_json(public / "data" / "geoids.json", geoids)

    soc_dir = public / "data" / "soc"
    if soc_dir.exists():
        for old in soc_dir.glob("*.json"):
            old.unlink()
    soc_dir.mkdir(parents=True, exist_ok=True)

    covered = 0
    for soc, table in tables.items():
        write_json(soc_dir / f"{soc}.json", table)
        covered += sum(1 for item in table if item is not None)

    print("Writing SOC autocomplete…")
    soc_codes = build_soc_codes(raw / "oes_soc_occs.csv", raw / "xwalk_plus.csv")
    # Keep options whose parent has wage data
    soc_codes = [item for item in soc_codes if item["parent"] in tables]
    write_json(public / "data" / "soc_codes.json", soc_codes, pretty=True)

    meta = {
        "wageYear": "2026-27",
        "source": "OFLC ALC_Export + Geography, Wage Year 2026-27",
        "hoursPerYear": HOURS_PER_YEAR,
        "encoding": "hourly cents [L1, L2, L3, L4] aligned to data/geoids.json",
        "occupations": len(tables),
        "counties": len(geoids),
        "unmatchedGeographyRows": len(unmatched),
        "countyWageCells": covered,
    }
    write_json(public / "data" / "meta.json", meta, pretty=True)

    def du(path: Path) -> int:
        if path.is_file():
            return path.stat().st_size
        return sum(p.stat().st_size for p in path.rglob("*") if p.is_file())

    geo_size = du(public / "counties.geojson")
    soc_size = du(soc_dir)
    total = du(public)
    print("Done.")
    print(f"  counties.geojson: {geo_size / 1e6:.1f} MB")
    print(f"  soc json:         {soc_size / 1e6:.1f} MB ({len(tables)} files)")
    print(f"  public/ total:    {total / 1e6:.1f} MB")
    if total > 95_000_000:
        print("WARNING: public/ is close to or over Vercel Hobby's 100 MB static upload limit.")


if __name__ == "__main__":
    main()
