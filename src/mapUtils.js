import { SITE_CONFIG } from "./siteConfig";

export const formatCurrency = (n) =>
  n || n === 0 ? n.toLocaleString(SITE_CONFIG.formatting.locale) : "";

export const parseCurrency = (s) => Number(String(s).replace(/,/g, ""));

export const formatAnnualToK = (value) => formatAnnual(value);

export const formatAnnual = (value) => {
  if (!Number.isFinite(value)) return SITE_CONFIG.formatting.emptyValue;
  return `${SITE_CONFIG.formatting.currencySymbol}${Math.round(
    value
  ).toLocaleString(SITE_CONFIG.formatting.locale)}`;
};

export const formatHourly = (value) => {
  if (!Number.isFinite(value)) return SITE_CONFIG.formatting.emptyValue;
  return `${SITE_CONFIG.formatting.currencySymbol}${value.toLocaleString(
    SITE_CONFIG.formatting.locale,
    { minimumFractionDigits: 2, maximumFractionDigits: 2 }
  )}/hr`;
};

// Must match your preprocessing normalization
export const normalize = (s) =>
  s
    .toLowerCase()
    .replace(SITE_CONFIG.data.countySuffix.toLowerCase(), "")
    .replace(/\s+/g, " ")
    .trim();

export function walkCoords(coords, cb) {
  if (!Array.isArray(coords)) return;
  if (typeof coords[0] === "number") {
    cb(coords);
  } else {
    coords.forEach((c) => walkCoords(c, cb));
  }
}

export function getBoundsFromGeometry(geometry) {
  if (!geometry || !geometry.coordinates) return null;

  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;

  walkCoords(geometry.coordinates, ([lng, lat]) => {
    if (lng < minLng) minLng = lng;
    if (lat < minLat) minLat = lat;
    if (lng > maxLng) maxLng = lng;
    if (lat > maxLat) maxLat = lat;
  });

  if (!Number.isFinite(minLng)) return null;

  return [
    [minLng, minLat],
    [maxLng, maxLat],
  ];
}

export function getFeatureCenter(feature) {
  const bounds = getBoundsFromGeometry(feature?.geometry);
  if (!bounds) return null;

  return [(bounds[0][0] + bounds[1][0]) / 2, (bounds[0][1] + bounds[1][1]) / 2];
}

export function mergeBounds(a, b) {
  if (!a) return b;
  if (!b) return a;

  return [
    [Math.min(a[0][0], b[0][0]), Math.min(a[0][1], b[0][1])],
    [Math.max(a[1][0], b[1][0]), Math.max(a[1][1], b[1][1])],
  ];
}

export function formatSocDisplay(option) {
  if (!option) return "";
  return `${option.code}${SITE_CONFIG.formatting.socSeparator}${option.title}`;
}

/** Wage files use the 6-digit parent (15-1252), not the detailed O*NET code. */
export function wageSocFromParam(raw) {
  if (!raw) return "";
  const match = String(raw).trim().match(/^(\d{2}-\d{4})/);
  return match ? match[1] : String(raw).trim();
}

export function resolveSoc(rawSoc, options) {
  if (!rawSoc || !Array.isArray(options) || !options.length) return null;

  const needle = String(rawSoc).trim().toLowerCase();
  if (!needle) return null;

  const exact = options.find((o) => String(o.code).toLowerCase() === needle);
  if (exact) {
    return { parent: exact.parent, display: formatSocDisplay(exact) };
  }

  const parentNeedle = wageSocFromParam(needle).toLowerCase();
  const children = options.filter(
    (o) => String(o.parent).toLowerCase() === parentNeedle
  );
  if (!children.length) return null;

  const preferred =
    children.find(
      (o) => String(o.code).toLowerCase() === `${parentNeedle}.00`
    ) || children[0];

  return { parent: preferred.parent, display: formatSocDisplay(preferred) };
}
