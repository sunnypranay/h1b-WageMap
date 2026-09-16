import React, { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";

import ControlPanel from "./ControlPanel";
import { SITE_CONFIG, STATE_ABBR_TO_NAME, STATE_FP_TO_ABBR } from "./siteConfig";
import {
  formatCurrency,
  parseCurrency,
  formatAnnual,
  formatHourly,
  getBoundsFromGeometry,
  getFeatureCenter,
  mergeBounds,
  resolveSoc,
  wageSocFromParam,
} from "./mapUtils";

import "./Map.css";
import { addWageMapLayers } from "./setupMapLayers";
import { ensurePopupInView } from "./popupPosition";

const {
  defaults,
  data,
  formatting,
  levels,
  lottery,
  map: mapConfig,
  query,
  share,
  wage,
} = SITE_CONFIG;

function decodeWages(cents) {
  if (!cents) return null;
  const decoded = {};
  levels.keys.forEach((key, idx) => {
    const value = cents[idx];
    decoded[key] = value == null ? null : value / 100;
  });
  return decoded;
}

function featureState(feature) {
  return (
    feature?.properties?.STUSPS ||
    STATE_FP_TO_ABBR[feature?.properties?.STATEFP] ||
    ""
  );
}

function featureLabel(feature) {
  const name = feature?.properties?.NAME;
  const lsad = feature?.properties?.LSAD;
  if (name && (lsad === "06" || lsad === "15")) return name;
  return feature?.properties?.NAMELSAD || name || "County";
}

function parseQueryState() {
  if (typeof window === "undefined") {
    return {
      hasQuery: false,
      state: "",
      county: "",
      soc: defaults.soc,
      socParam: defaults.soc,
      socText: defaults.socText,
      salary: defaults.salary,
      lotteryEnabled: false,
    };
  }

  const params = new URLSearchParams(window.location.search);
  const hasQuery = Array.from(params.keys()).length > 0;
  const rawState = params.get(query.keys.state);
  const rawCounty = params.get(query.keys.county);
  const rawSoc = params.get(query.keys.soc);
  const rawSalary = params.get(query.keys.salary);
  const rawH1b = params.get(query.keys.h1b);

  const state = rawState ? rawState.toUpperCase() : "";
  const county = rawCounty ? rawCounty : "";
  const socParam = rawSoc ? String(rawSoc).trim() : defaults.soc;
  const soc = wageSocFromParam(socParam) || defaults.soc;
  const socText =
    !rawSoc || wageSocFromParam(socParam) === defaults.soc
      ? defaults.socText
      : socParam;
  const salary =
    rawSalary && Number.isFinite(Number(rawSalary))
      ? Number(rawSalary)
      : defaults.salary;
  const lotteryEnabled = query.truthyValues.includes(
    String(rawH1b).toLowerCase()
  );

  return {
    hasQuery,
    state,
    county,
    soc,
    socParam,
    socText,
    salary,
    lotteryEnabled,
  };
}

export default function Map() {
  const mapRef = useRef(null);
  const activePopupRef = useRef(null);
  const activeFeatureRef = useRef(null);
  const countiesRef = useRef(null);
  const countyFeatureMapRef = useRef({});
  const countiesByStateRef = useRef({});
  const wageTableRef = useRef(null);
  const geoidsRef = useRef(null);
  const lotteryEnabledRef = useRef(false);
  const initialQueryRef = useRef(parseQueryState());
  const initialLocationAppliedRef = useRef(false);
  const [locationsReady, setLocationsReady] = useState(false);

  const [collapsed, setCollapsed] = useState(() =>
    typeof window !== "undefined"
      ? window.matchMedia("(max-width: 640px)").matches
      : false
  );
  const [soc, setSoc] = useState(initialQueryRef.current.soc);
  const [socText, setSocText] = useState(initialQueryRef.current.socText);

  const [salary, setSalary] = useState(initialQueryRef.current.salary);
  const [stateOptions, setStateOptions] = useState([]);
  const [countyOptions, setCountyOptions] = useState([]);
  const [selectedState, setSelectedState] = useState(
    initialQueryRef.current.state
  );
  const [selectedCounty, setSelectedCounty] = useState(
    initialQueryRef.current.county
  );
  const [lotteryEnabled, setLotteryEnabled] = useState(
    initialQueryRef.current.lotteryEnabled
  );
  const [wagesLoading, setWagesLoading] = useState(true);
  const wageRequestRef = useRef(0);

  function handleShare() {
    const url = window.location.href;

    if (navigator.share) {
      navigator.share({
        title: share.title,
        text: share.text,
        url,
      });
    } else {
      navigator.clipboard.writeText(url);
      alert(share.copiedMessage);
    }
  }

  useEffect(() => {
    if (mapRef.current) return;

    const map = new maplibregl.Map({
      container: "map",
      style: mapConfig.styleUrl,
      bounds: mapConfig.bounds,
      fitBoundsOptions: { padding: mapConfig.fitBounds.initPadding },
    });

    mapRef.current = map;

    map.on("load", async () => {
      const [countyRes, geoidRes] = await Promise.all([
        fetch(data.countiesUrl),
        fetch(data.geoidsUrl),
      ]);
      const counties = await countyRes.json();
      geoidsRef.current = await geoidRes.json();
      countiesRef.current = counties;

      prepareLocationData(counties);

      const hatchSize = 16;
      const canvas = document.createElement("canvas");
      canvas.width = hatchSize;
      canvas.height = hatchSize;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#f4f6f8";
      ctx.fillRect(0, 0, hatchSize, hatchSize);
      ctx.strokeStyle = "#c5cad3";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(0, hatchSize);
      ctx.lineTo(hatchSize, 0);
      ctx.moveTo(-5, 5);
      ctx.lineTo(5, -5);
      ctx.moveTo(hatchSize - 5, hatchSize + 5);
      ctx.lineTo(hatchSize + 5, hatchSize - 5);
      ctx.stroke();
      if (map.hasImage("no-data-hatch")) map.removeImage("no-data-hatch");
      map.addImage("no-data-hatch", ctx.getImageData(0, 0, hatchSize, hatchSize));

      addWageMapLayers(map, counties, mapConfig);

      const onCountyClick = (e) => {
        const f = e.features?.[0];
        if (!f) return;
        showCountyPopup(f, e.lngLat);
      };
      map.on("click", mapConfig.layers.countyFill, onCountyClick);
      map.on("click", mapConfig.layers.countyNoData, onCountyClick);

      [mapConfig.layers.countyFill, mapConfig.layers.countyNoData].forEach(
        (layerId) => {
          map.on("mouseenter", layerId, () => {
            map.getCanvas().style.cursor = "pointer";
          });
          map.on("mouseleave", layerId, () => {
            map.getCanvas().style.cursor = "";
          });
        }
      );

      updateLevels(soc, salary);
    });

    return () => {
      activePopupRef.current?.remove();
      map.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function prepareLocationData(countiesGeojson) {
    const stateSet = new Set();
    const byState = {};
    const featureMap = {};

    countiesGeojson.features.forEach((f) => {
      const abbr = featureState(f);
      if (!abbr) return;

      stateSet.add(abbr);
      featureMap[f.properties.GEOID] = f;

      if (!byState[abbr]) byState[abbr] = [];
      byState[abbr].push({
        name: featureLabel(f),
        geoid: f.properties.GEOID,
      });
    });

    Object.values(byState).forEach((list) =>
      list.sort((a, b) => a.name.localeCompare(b.name))
    );

    countiesByStateRef.current = byState;
    countyFeatureMapRef.current = featureMap;
    setStateOptions(Array.from(stateSet).sort());
    setLocationsReady(true);
  }

  function clearActivePopup() {
    activePopupRef.current?.remove();
    activePopupRef.current = null;
    activeFeatureRef.current = null;
  }

  async function updateLevels(selectedSoc, annualSalary) {
    if (!mapRef.current || !countiesRef.current) return;

    const annual = Number(annualSalary);
    if (!Number.isFinite(annual)) {
      setWagesLoading(false);
      return;
    }

    const requestId = ++wageRequestRef.current;
    setWagesLoading(true);
    const hourly = annual / wage.hoursPerYear;

    try {
    if (!geoidsRef.current) {
      const geoidRes = await fetch(data.geoidsUrl);
      if (!geoidRes.ok) return;
      geoidsRef.current = await geoidRes.json();
    }

    const socRes = await fetch(`${data.socDataPath}/${selectedSoc}.json`);
    if (!socRes.ok) return;

    const packed = await socRes.json();
    if (wageRequestRef.current !== requestId) return;
    const wageTable = {};
    geoidsRef.current.forEach((geoid, i) => {
      const decoded = decodeWages(packed[i]);
      if (decoded) wageTable[geoid] = decoded;
    });

    const counties = structuredClone(countiesRef.current);
    wageTableRef.current = wageTable;

    counties.features.forEach((f) => {
      delete f.properties.level;

      const levelSet = wageTable[f.properties.GEOID];
      if (!levelSet) return;

      let level = 0;
      if (levelSet.IV && hourly >= levelSet.IV) level = 4;
      else if (levelSet.III && hourly >= levelSet.III) level = 3;
      else if (levelSet.II && hourly >= levelSet.II) level = 2;
      else if (levelSet.I && hourly >= levelSet.I) level = 1;

      f.properties.level = level;
    });

    const src = mapRef.current.getSource(mapConfig.sources.counties);
    if (src) src.setData(counties);
    countiesRef.current = counties;
    countyFeatureMapRef.current = Object.fromEntries(
      counties.features.map((f) => [f.properties.GEOID, f])
    );

    mapRef.current.setPaintProperty(mapConfig.layers.countyFill, "fill-color", [
      "case",
      ["==", ["get", "level"], 4],
      levels.colors[4],
      ["==", ["get", "level"], 3],
      levels.colors[3],
      ["==", ["get", "level"], 2],
      levels.colors[2],
      ["==", ["get", "level"], 1],
      levels.colors[1],
      ["==", ["get", "level"], 0],
      levels.colors[0],
      mapConfig.paint.noDataFill,
    ]);

    if (mapRef.current.getLayer(mapConfig.layers.countyNoData)) {
      mapRef.current.setFilter(mapConfig.layers.countyNoData, [
        "!",
        ["has", "level"],
      ]);
    }

    const active = activeFeatureRef.current;
    if (active) {
      const updatedFeature = countyFeatureMapRef.current[active.geoid];
      if (updatedFeature) {
        showCountyPopup(updatedFeature, active.point);
      } else {
        clearActivePopup();
      }
    }
    } finally {
      if (wageRequestRef.current === requestId) setWagesLoading(false);
    }
  }

  function fitToBounds(bounds, options = {}) {
    if (!mapRef.current || !bounds) return;
    mapRef.current.fitBounds(bounds, {
      padding: mapConfig.fitBounds.padding,
      duration: mapConfig.fitBounds.duration,
      ...options,
    });
  }

  function showCountyPopup(feature, lngLat) {
    if (!mapRef.current || !feature) return;
    const lotteryOn = lotteryEnabledRef.current;
    const state = featureState(feature);
    const wageTable = wageTableRef.current;
    const levelInfo = wageTable ? wageTable[feature.properties.GEOID] : null;
    const hasLevelData = Boolean(levelInfo);
    const currentLevel = feature.properties.level;
    const chance = currentLevel > 0 ? lottery.selectionByLevel[currentLevel] : undefined;
    const levelLabel = !hasLevelData
      ? levels.labels.noData
      : currentLevel === 0 || currentLevel === undefined
        ? levels.labels.belowLevel
        : `${levels.labels.levelPrefix} ${levels.keys[currentLevel - 1]}`;
    const levelClass =
      !hasLevelData || currentLevel === 0 || currentLevel === undefined
        ? "level-none"
        : "has-level";
    const levelColor =
      Number.isInteger(currentLevel) && levels.colors[currentLevel]
        ? levels.colors[currentLevel]
        : mapConfig.paint.noLevelBadge;
    const salaryFloors = levels.keys.map((k) => {
      const hourly = levelInfo?.[k];
      if (!Number.isFinite(hourly)) return formatting.emptyValue;
      const annual = hourly * wage.hoursPerYear;
      return `<div>${formatAnnual(annual)}+</div><div class=\"hourly-col\">${formatHourly(hourly)}</div>`;
    });
    const levelRows = levels.keys.map((k, idx) => {
      const levelNumber = idx + 1;
      const salaryRange = salaryFloors[idx];
      const rowChance = lotteryOn ? lottery.selectionByLevel[levelNumber] : null;
      const chanceCell =
        lotteryOn && rowChance !== null
          ? `<td class=\"chance-col\">${Number.isFinite(rowChance) ? `${rowChance}%` : formatting.emptyValue}</td>`
          : "";
      return `<tr class=\"${currentLevel === levelNumber ? "is-active-row" : ""}\"><td class=\"level-col\">${levels.labels.tableLevelPrefix} ${k}</td><td class=\"salary-col\">${salaryRange}</td>${chanceCell}</tr>`;
    }).join("");
    const selectionLine =
      lotteryOn && chance
        ? `${lottery.selectionLineTemplate.replace("{{chance}}", chance)} <span class=\"selection-note\">${lottery.disclaimer}</span>`
        : "";
    const point = lngLat || getFeatureCenter(feature);
    if (!point) return;
    activePopupRef.current?.remove();
    const popup = new maplibregl.Popup({
      offset: mapConfig.popupOffset,
      focusAfterOpen: false,
      closeButton: false,
      className: "county-popup",
      maxWidth: "min(360px, calc(100vw - 24px))",
    })
      .setLngLat(point)
      .setHTML(`<div class=\"county-popup-content\"><div class=\"popup-top\"><div><div class=\"popup-title\">${featureLabel(feature)}, ${STATE_ABBR_TO_NAME[state] || state}</div></div><div class=\"popup-top-actions\"><span class=\"level-badge ${levelClass}\"><span class=\"level-dot\" style=\"background:${levelColor};\"></span><span class=\"level-badge-text\">${levelLabel}</span></span><button type=\"button\" class=\"popup-close\" aria-label=\"Close\">×</button></div></div>${selectionLine ? `<div class=\"selection-line\">${selectionLine}</div>` : ""}<div class=\"level-table-wrapper\"><table class=\"level-table\" role=\"table\"><thead><tr><th>${levels.labels.tableHeaders.level}</th><th>${levels.labels.tableHeaders.salary}</th>${lotteryOn ? `<th>${levels.labels.tableHeaders.probability}</th>` : ""}</tr></thead><tbody>${levelRows}</tbody></table></div></div>`)
      .addTo(mapRef.current);
    popup.getElement()?.querySelector(".popup-close")?.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      clearActivePopup();
    });
    activeFeatureRef.current = { geoid: feature.properties.GEOID, point };
    activePopupRef.current = popup;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => ensurePopupInView(mapRef.current, popup));
    });
  }

  function zoomToState(stateAbbr) {
    if (!countiesRef.current) return;
    let bounds = null;
    countiesRef.current.features.filter((f) => featureState(f) === stateAbbr).forEach((f) => {
      bounds = mergeBounds(bounds, getBoundsFromGeometry(f.geometry));
    });
    if (bounds) fitToBounds(bounds);
  }

  function zoomToCounty(geoid) {
    const feature = countyFeatureMapRef.current[geoid];
    if (!feature) return;
    const bounds = getBoundsFromGeometry(feature.geometry);
    if (bounds) fitToBounds(bounds, { maxZoom: mapConfig.maxCountyZoom });
    return feature;
  }

  function handleStateChange(nextState) {
    setSelectedState(nextState);
    setSelectedCounty("");
    setCountyOptions(countiesByStateRef.current[nextState] ?? []);
    clearActivePopup();
    if (!nextState) fitToBounds(mapConfig.bounds);
    else zoomToState(nextState);
  }

  function handleCountyChange(nextCounty) {
    setSelectedCounty(nextCounty);
    if (nextCounty) {
      const feature = zoomToCounty(nextCounty);
      showCountyPopup(feature);
    } else {
      clearActivePopup();
    }
  }

  function handleSocSelect(code, display) {
    setSoc(code);
    setSocText(display);
    updateLevels(code, salary);
  }

  function handleSalaryChange(nextValue) {
    const raw = parseCurrency(nextValue);
    if (Number.isNaN(raw)) return;
    setSalary(raw);
    updateLevels(soc, raw);
  }

  function handleSalaryClear() {
    setSalary("");
    updateLevels(soc, Number.NaN);
  }

  useEffect(() => {
    lotteryEnabledRef.current = lotteryEnabled;
    const active = activeFeatureRef.current;
    if (!active) return;
    const updatedFeature = countyFeatureMapRef.current[active.geoid];
    if (updatedFeature) showCountyPopup(updatedFeature, active.point);
  }, [lotteryEnabled]);

  useEffect(() => {
    const { soc: initialSoc, socParam, socText: initialText } = initialQueryRef.current;
    if (!socParam) return undefined;
    let cancelled = false;
    fetch(data.socCodesUrl).then((r) => r.json()).then((options) => {
      if (cancelled) return;
      const resolved = resolveSoc(socParam, options);
      if (!resolved) return;
      setSoc((current) => current === initialSoc || current === resolved.parent ? resolved.parent : current);
      setSocText((current) => current === initialText || current === socParam ? resolved.display : current);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!locationsReady || initialLocationAppliedRef.current) return;
    const { state, county } = initialQueryRef.current;
    let targetState = state;
    let targetCounty = county;
    if (!targetState && targetCounty) {
      const feature = countyFeatureMapRef.current[targetCounty];
      if (feature) targetState = featureState(feature);
    }
    if (targetState) handleStateChange(targetState);
    if (targetCounty) handleCountyChange(targetCounty);
    initialLocationAppliedRef.current = true;
  }, [locationsReady]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (selectedState) params.set(query.keys.state, selectedState);
    else params.delete(query.keys.state);
    if (selectedCounty) params.set(query.keys.county, selectedCounty);
    else params.delete(query.keys.county);
    if (soc) params.set(query.keys.soc, soc);
    else params.delete(query.keys.soc);
    if (salary !== "" && Number.isFinite(Number(salary))) params.set(query.keys.salary, String(Number(salary)));
    else params.delete(query.keys.salary);
    if (lotteryEnabled) params.set(query.keys.h1b, "1");
    else params.delete(query.keys.h1b);
    const nextQuery = params.toString();
    const nextUrl = `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ""}${window.location.hash}`;
    window.history.replaceState(null, "", nextUrl);
  }, [selectedState, selectedCounty, soc, salary, lotteryEnabled]);

  const occupationDisplay = socText || formatting.emptyValue;
  const salaryDisplay =
    salary === "" || Number.isNaN(Number(salary))
      ? formatting.emptyValue
      : `${formatting.currencySymbol}${formatCurrency(Number(salary))}${formatting.annualSuffix}`;

  return (
    <>
      <ControlPanel
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed((v) => !v)}
        stateOptions={stateOptions}
        countyOptions={countyOptions}
        selectedState={selectedState}
        selectedCounty={selectedCounty}
        onStateChange={handleStateChange}
        onCountyChange={handleCountyChange}
        socText={socText}
        onSocSelect={handleSocSelect}
        salary={salary}
        onSalaryChange={handleSalaryChange}
        onClearSalary={handleSalaryClear}
        occupationDisplay={occupationDisplay}
        salaryDisplay={salaryDisplay}
        handleShare={handleShare}
        lotteryEnabled={lotteryEnabled}
        onToggleLottery={() => setLotteryEnabled((v) => !v)}
        wagesLoading={wagesLoading}
      />
      <div id="map" />
    </>
  );
}
