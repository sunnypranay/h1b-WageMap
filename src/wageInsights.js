import { SITE_CONFIG } from "./siteConfig";

const { levels, wage } = SITE_CONFIG;

export function wageSignature(levelInfo) {
  if (!levelInfo) return "";
  return levels.keys.map((key) => {
    const value = levelInfo[key];
    return Number.isFinite(value) ? Math.round(value * 100) : "x";
  }).join("|");
}

export function nextLevelGap(levelInfo, annual, hoursPerYear = wage.hoursPerYear) {
  if (!levelInfo || !Number.isFinite(annual)) return null;
  const hourly = annual / hoursPerYear;
  for (let i = 0; i < levels.keys.length; i += 1) {
    const key = levels.keys[i];
    const floor = levelInfo[key];
    if (!Number.isFinite(floor) || hourly >= floor) continue;
    const targetAnnual = floor * hoursPerYear;
    return {
      key,
      levelNumber: i + 1,
      targetAnnual,
      gap: Math.max(0, targetAnnual - annual),
    };
  }
  if (Number.isFinite(levelInfo.IV) && hourly >= levelInfo.IV) {
    return { key: "IV", levelNumber: 4, atMax: true, gap: 0, targetAnnual: levelInfo.IV * hoursPerYear };
  }
  return null;
}

export function sameWageAreaPeers(geoid, wageTable, featureMap, labelFn, stateFn) {
  const mine = wageTable?.[geoid];
  if (!mine) return [];
  const signature = wageSignature(mine);
  if (!signature) return [];

  const peers = [];
  Object.keys(wageTable).forEach((id) => {
    if (id === geoid) return;
    if (wageSignature(wageTable[id]) !== signature) return;
    const feature = featureMap[id];
    if (!feature) return;
    peers.push({
      geoid: id,
      name: labelFn(feature),
      state: stateFn(feature),
    });
  });
  peers.sort((a, b) => a.name.localeCompare(b.name) || a.state.localeCompare(b.state));
  return peers;
}

function countyRecord(feature, wageTable, annual, hoursPerYear, labelFn, stateFn) {
  const geoid = feature?.properties?.GEOID;
  const wages = wageTable?.[geoid];
  if (!geoid || !wages) return null;
  const hourly = annual / hoursPerYear;
  let level = 0;
  if (wages.IV && hourly >= wages.IV) level = 4;
  else if (wages.III && hourly >= wages.III) level = 3;
  else if (wages.II && hourly >= wages.II) level = 2;
  else if (wages.I && hourly >= wages.I) level = 1;
  return {
    geoid,
    name: labelFn(feature),
    state: stateFn(feature),
    level,
    floors: wages,
    levelIAnnual: Number.isFinite(wages.I) ? wages.I * hoursPerYear : Number.POSITIVE_INFINITY,
    levelIIAnnual: Number.isFinite(wages.II) ? wages.II * hoursPerYear : Number.POSITIVE_INFINITY,
  };
}

export function buildCountyLists(features, wageTable, annual, hoursPerYear, labelFn, stateFn, limit = 8) {
  if (!Array.isArray(features) || !wageTable || !Number.isFinite(annual)) {
    return { highLevel: [], cheapestLevelII: [] };
  }

  const rows = [];
  features.forEach((feature) => {
    const row = countyRecord(feature, wageTable, annual, hoursPerYear, labelFn, stateFn);
    if (row) rows.push(row);
  });

  const highLevel = rows
    .filter((row) => row.level >= 3)
    .sort((a, b) => b.level - a.level || a.levelIAnnual - b.levelIAnnual || a.name.localeCompare(b.name))
    .slice(0, limit);

  const cheapestLevelII = rows
    .filter((row) => row.level >= 2)
    .sort((a, b) => a.levelIIAnnual - b.levelIIAnnual || b.level - a.level || a.name.localeCompare(b.name))
    .slice(0, limit);

  return { highLevel, cheapestLevelII };
}
