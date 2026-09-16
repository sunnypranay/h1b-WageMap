import React, { useEffect, useRef, useState } from "react";
import { SITE_CONFIG } from "./siteConfig";
import { searchLocations } from "./locationSearch";

const { ui } = SITE_CONFIG;

export default function LocationSearch({ index = [], onPick }) {
  const wrapRef = useRef(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const results = searchLocations(Array.isArray(index) ? index : [], query);

  useEffect(() => {
    function onPointerDown(event) {
      if (wrapRef.current && !wrapRef.current.contains(event.target)) {
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  function choose(item) {
    if (!item?.geoid) return;
    onPick?.(item);
    setQuery(`${item.name}, ${item.state || ""}`.replace(/,\s*$/, ""));
    setOpen(false);
  }

  return (
    <div className="location-search" ref={wrapRef}>
      <input
        className="input-box"
        type="text"
        value={query}
        autoComplete="off"
        spellCheck={false}
        placeholder={ui.location.searchPlaceholder}
        aria-label={ui.location.searchPlaceholder}
        onFocus={() => setOpen(true)}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" && results[0]) {
            event.preventDefault();
            choose(results[0]);
          }
          if (event.key === "Escape") setOpen(false);
        }}
      />
      {open && query.trim().length >= 2 && (
        <div className="soc-menu location-menu">
          {results.length === 0 && (
            <div className="soc-option soc-option-hint">{ui.location.searchEmpty}</div>
          )}
          {results.map((item) => (
            <button
              type="button"
              key={`${item.type}-${item.geoid}-${item.name}`}
              className="soc-option location-option"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(item)}
            >
              <span className="location-option-name">{item.name}</span>
              <span className="location-option-meta">
                {item.state} · {item.type === "city" ? "city" : "county"}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
