import React, { useEffect, useMemo, useRef, useState } from "react";
import { SITE_CONFIG } from "./siteConfig";

const { autocomplete, data, formatting, ui } = SITE_CONFIG;
const MAX_RESULTS = 40;

function tokens(value) {
  return String(value).toLowerCase().match(/[a-z0-9]+/g) || [];
}

function optionMatches(option, query) {
  const hay = `${option.code} ${option.title}`.toLowerCase();
  const parts = tokens(query);
  if (!parts.length) return false;
  return parts.every((part) => hay.includes(part));
}

function shouldAutofocus(requested) {
  if (!requested || typeof window === "undefined") return false;
  return window.matchMedia("(min-width: 641px)").matches;
}

export default function SocAutocomplete({ value, onSelect, autoFocus = false }) {
  const wrapperRef = useRef(null);
  const inputRef = useRef(null);

  const [options, setOptions] = useState([]);
  const [query, setQuery] = useState(value ? value : "");
  const [open, setOpen] = useState(false);
  const focusOnMount = shouldAutofocus(autoFocus);

  useEffect(() => {
    fetch(data.socCodesUrl)
      .then((r) => r.json())
      .then(setOptions);
  }, []);

  useEffect(() => {
    if (value) setQuery(value);
  }, [value]);

  useEffect(() => {
    function handleClickOutside(e) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const searching = query.trim() !== "" && query.trim() !== (value || "").trim();

  const filtered = useMemo(() => {
    if (!searching) return [];
    return options.filter((o) => optionMatches(o, query)).slice(0, MAX_RESULTS);
  }, [options, query, searching]);

  return (
    <div ref={wrapperRef} style={autocomplete.wrapperStyle}>
      <input
        ref={inputRef}
        className="input-box"
        type="text"
        value={query}
        autoFocus={focusOnMount}
        autoComplete="off"
        spellCheck={false}
        placeholder={ui.occupation.placeholder}
        onFocus={(e) => {
          e.target.select();
          setOpen(true);
        }}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        style={{ paddingRight: autocomplete.inputPaddingRight }}
      />
      {query && (
        <button
          type="button"
          className="clear-btn"
          aria-label={ui.occupation.clearLabel}
          onClick={() => {
            setQuery("");
            setOpen(true);
            inputRef.current?.focus();
          }}
        >
          ×
        </button>
      )}
      {open && (
        <div className="soc-menu" style={autocomplete.menuStyle}>
          {!searching && (
            <div className="soc-option soc-option-hint">
              Type any part of a job title or SOC code
            </div>
          )}
          {searching && filtered.length === 0 && (
            <div className="soc-option soc-option-hint">
              No matches. Try “software”, “nurse”, or a SOC like 15-1252.
            </div>
          )}
          {filtered.map((o) => (
            <div
              key={o.code}
              className="soc-option"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                const display = `${o.code}${formatting.socSeparator}${o.title}`;
                onSelect(o.parent, display);
                setQuery(display);
                setOpen(false);
              }}
              style={autocomplete.optionStyle}
            >
              <strong>{o.code}</strong> — {o.title}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
