import React, { useEffect, useRef, useState } from "react";
import { SITE_CONFIG } from "./siteConfig";
import { searchLocations } from "./locationSearch";

const { ui } = SITE_CONFIG;

export default function LocationSearch({ index, onPick }) {
  const wrapRef = useRef(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const results = searchLocations(index, query);

  useEffect(() => {
    function onPointerDown(event) {
      if (wrapRef.current && !wrapRef.current.contains(event.target)) {
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

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
            onPick(results[0]);
            setQuery(`${results[0].name}, ${results[0].state}`);
            setOpen(false);
          }
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
              onClick={() => {
                onPick(item);
                setQuery(`${item.name}, ${item.state}`);
                setOpen(false);
              }}
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
