# Disclosures

WageMap is a static, client-only visualization. No application data is sent to a backend that we control; all computations run in the browser.

## Datasets

| Data | Source | How we use it | Storage | Refresh / notes |
| --- | --- | --- | --- | --- |
| Prevailing wage levels (Level I–IV) | U.S. Department of Labor, OFLC Prevailing Wage Data 2026–2027 (ALC export + Geography lookup) | Determine the county-level wage floor per SOC and compute the wage level for a user-entered salary | `public/data/soc/<SOC>.json` generated from `raw/ALC_Export.csv` + `raw/Geography.csv` via `scripts/process_oflc_wages.py` | Hourly cents packed in GEOID order; annual OFLC rows converted at 2,080 hours/year; not legal advice |
| SOC codes & titles | OFLC `oes_soc_occs.csv` + `xwalk_plus.csv` (Wage Year 2026–27) | Populate the occupation autocomplete and display titles | `public/data/soc_codes.json` | Detailed O*NET codes map to parent SOC wage files |
| County boundaries | U.S. Census Bureau cartographic boundary shapefile `cb_2023_us_county_5m` | Render county polygons (including Connecticut planning regions) and derive dropdowns | `public/counties.geojson` | Generalized geometry; properties include STATEFP, GEOID, NAME, NAMELSAD, STUSPS |
| Basemap tiles | OpenFreeMap Positron style served through MapLibre GL | Background map under the county overlay | Requests go to OpenFreeMap; no Mapbox token | Subject to OpenFreeMap terms |
| Lottery probabilities | DHS estimates for the wage-weighted H-1B selection rule | Optional overlay of illustrative 2027–2028 selection probability by wage level | In-code constants in `src/siteConfig.js` | Level I 15.29%, II 30.58%, III 45.87%, IV 61.16%; replace when official rates are published |

## Privacy notes

- The app does not log or persist user-entered salaries or selections; everything stays in the browser.
- Basemap tile requests go directly from the browser to OpenFreeMap.
- Sharing uses the native share sheet (if available) or copies the current URL to the clipboard.

## Limitations and disclaimers

- Wage and lottery data are for informational/visualization purposes only and should not be treated as legal advice or an official prevailing wage determination.
- Static datasets may become outdated; rebuild data when OFLC publishes new releases or when USCIS announces updated H-1B selection rates.
- This project is based on [WageMap by Venu Vardhan Reddy Tekula (vchrombie)](https://github.com/vchrombie/wagemap) (MIT).
