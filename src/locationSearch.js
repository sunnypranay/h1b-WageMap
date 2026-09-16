function tokens(value) {
  return String(value || "")
    .toLowerCase()
    .match(/[a-z0-9]+/g) || [];
}

export function normalizeSearch(value) {
  return tokens(value).join(" ");
}

export function matchesQuery(haystack, query) {
  const hay = String(haystack || "").toLowerCase();
  const parts = tokens(query);
  if (!parts.length) return false;
  return parts.every((part) => hay.includes(part));
}

export function buildLocationIndex(cities, countyEntries) {
  const items = [];
  const seen = new Set();

  (Array.isArray(cities) ? cities : []).forEach((city) => {
    if (!city?.geoid || !city?.name) return;
    const key = `city:${city.geoid}:${city.name}`;
    if (seen.has(key)) return;
    seen.add(key);
    const aliases = Array.isArray(city.aliases) ? city.aliases.join(" ") : "";
    items.push({
      type: "city",
      name: city.name,
      state: city.state,
      geoid: String(city.geoid),
      hay: `${city.name} ${city.state} ${aliases}`.toLowerCase(),
    });
  });

  (Array.isArray(countyEntries) ? countyEntries : []).forEach((county) => {
    if (!county?.geoid || !county?.name) return;
    items.push({
      type: "county",
      name: county.name,
      state: county.state,
      geoid: String(county.geoid),
      hay: `${county.name} ${county.state}`.toLowerCase(),
    });
  });

  return items;
}

export function searchLocations(index, query, limit = 8) {
  const q = String(query || "").trim();
  if (q.length < 2) return [];
  if (!Array.isArray(index) || index.length === 0) return [];

  const scored = [];
  index.forEach((item) => {
    if (!item?.hay || !item?.name) return;
    if (!matchesQuery(item.hay, q)) return;
    const name = String(item.name).toLowerCase();
    const needle = q.toLowerCase();
    let score = 0;
    if (name === needle) score += 80;
    else if (name.startsWith(needle)) score += 40;
    else if (name.includes(needle)) score += 20;
    if (item.type === "city") score += 8;
    if (item.state && tokens(q).includes(String(item.state).toLowerCase())) score += 12;
    scored.push({ item, score });
  });
  scored.sort((a, b) => b.score - a.score || a.item.name.localeCompare(b.item.name));
  return scored.slice(0, limit).map((entry) => entry.item);
}
