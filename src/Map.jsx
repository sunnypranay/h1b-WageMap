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
