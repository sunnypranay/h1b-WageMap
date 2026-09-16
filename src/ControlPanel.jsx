import React, { useEffect, useRef, useState } from "react";
import LegendItem from "./LegendItem";
import SocAutocomplete from "./SocAutocomplete";
import { SITE_CONFIG, STATE_ABBR_TO_NAME } from "./siteConfig";
import { formatCurrency } from "./mapUtils";

const { app, formatting, levels, links, lottery, ui } = SITE_CONFIG;

function OccupationHelp() {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    function onPointerDown(event) {
      if (wrapRef.current && !wrapRef.current.contains(event.target)) {
        setOpen(false);
      }
    }

    function onKeyDown(event) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div
      ref={wrapRef}
      className={`info-wrapper${open ? " is-open" : ""}`}
    >
      <button
        type="button"
        className="info-icon"
        aria-label={ui.occupation.helpLabel}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="16" x2="12" y2="12" />
          <line x1="12" y1="8" x2="12.01" y2="8" />
        </svg>
      </button>

      <div className="info-tooltip" role="tooltip">
        <strong>{ui.occupation.infoTitle}</strong>
        <p>{ui.occupation.infoParagraphs[0]}</p>
        <p>{ui.occupation.infoParagraphs[1]}</p>
        <p>{ui.occupation.infoParagraphs[2]}</p>
        <p>
          Try{" "}
          <a href={links.onet} target="_blank" rel="noopener noreferrer">
            {ui.occupation.infoLinkText}
          </a>{" "}
          {ui.occupation.infoParagraphs[3]}
        </p>
      </div>
    </div>
  );
}

export default function ControlPanel({
  collapsed,
  wagesLoading,
  onToggleCollapse,
  stateOptions,
  countyOptions,
  selectedState,
  selectedCounty,
  onStateChange,
  onCountyChange,
  socText,
  onSocSelect,
  salary,
  onSalaryChange,
  onClearSalary,
  occupationDisplay,
  salaryDisplay,
  handleShare,
  lotteryEnabled,
  onToggleLottery,
}) {
  return (
    <div
      className={`control-panel ${collapsed ? "collapsed" : ""}${
        wagesLoading ? " is-loading" : ""
      }`}
    >
      {wagesLoading && (
        <div className="panel-loading" role="status" aria-live="polite">
          Updating map
        </div>
      )}
      {/* Title Row (clickable) */}
      <div
        className="title-row"
        onClick={onToggleCollapse}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") onToggleCollapse();
        }}
        aria-label={
          collapsed ? ui.panel.expandAriaLabel : ui.panel.collapseAriaLabel
        }
      >
        <div className="title">
          <img
            className="app-mark"
            src={app.markSrc}
            width="22"
            height="22"
            alt=""
          />
          {app.name}
        </div>
        <div
          className="collapse-icon"
          title={collapsed ? ui.panel.expandTitle : ui.panel.collapseTitle}
        >
          {/* add up arrow logo and down arrow logo */}
          {collapsed ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M6 9l6 6 6-6H6z" />
            </svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M6 15l6-6 6 6H6z" />
            </svg>
          )}
        </div>
      </div>

      {!collapsed && (
        <>
          <div className="subtitle">{app.subtitle}</div>
          <div className="year-note">{app.yearNote}</div>

          <div className="section panel-card">
            <div className="label-row">
              <label className="label">{ui.occupation.label}</label>
              <span className="hint">{ui.occupation.hint}</span>
            </div>

            <div className="row">
              <SocAutocomplete
                value={socText}
                onSelect={onSocSelect}
                autoFocus
              />
              <OccupationHelp />
            </div>
          </div>

          <div className="section panel-card">
            <div className="label-row">
              <label className="label">{ui.salary.label}</label>
              <span className="hint">{ui.salary.hint}</span>
            </div>

            <div className="salary-row">
              <div className="salary-input">
                <span>{formatting.currencySymbol}</span>
                <input
                  type="text"
                  value={formatCurrency(salary)}
                  inputMode="numeric"
                  style={{ paddingRight: ui.salary.inputPaddingRight }}
                  onChange={(e) => onSalaryChange(e.target.value)}
                />
                {salary !== "" && (
                  <button
                    type="button"
                    className="clear-btn"
                    aria-label={ui.salary.clearLabel}
                    onClick={onClearSalary}
                  >
                    ×
                  </button>
                )}
              </div>

              <button
                type="button"
                className="hide-panel-btn"
                aria-label={ui.panel.minimizeButtonLabel}
                title={ui.panel.collapseTitle}
                onClick={onToggleCollapse}
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path d="M6 15l6-6 6 6H6z" />
                </svg>
                <span className="hide-panel-label">Hide</span>
              </button>
            </div>
          </div>

          <div className="section panel-card">
            <div className="label-row">
              <label className="label">{ui.location.label}</label>
              <span className="hint">{ui.location.hint}</span>
            </div>

            <div className="row">
              <select
                className="select-box select-half"
                value={selectedState}
                onChange={(e) => onStateChange(e.target.value)}
              >
                <option value="">{ui.location.allStates}</option>
                {stateOptions
                  .slice()
                  .sort((a, b) =>
                    (STATE_ABBR_TO_NAME[a] || a).localeCompare(
                      STATE_ABBR_TO_NAME[b] || b
                    )
                  )
                  .map((abbr) => (
                    <option key={abbr} value={abbr}>
                      {STATE_ABBR_TO_NAME[abbr] || abbr}
                    </option>
                  ))}
              </select>
              <select
                className="select-box select-half"
                value={selectedCounty}
                onChange={(e) => onCountyChange(e.target.value)}
                disabled={!selectedState}
              >
                <option value="">
                  {selectedState
                    ? ui.location.selectCounty
                    : ui.location.pickStateFirst}
                </option>
                {countyOptions.map((county) => (
                  <option key={county.geoid} value={county.geoid}>
                    {county.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="section panel-card">
            <div className="toggle-row">
              <div className="toggle-copy">
                <div className="toggle-subtitle">
                  {lottery.toggleQuestion}
                </div>
                <div className="toggle-disclaimer">{lottery.disclaimer}</div>
              </div>
              <div className="toggle-stack">
                <button
                  type="button"
                  className={`toggle ${lotteryEnabled ? "on" : ""}`}
                  aria-pressed={lotteryEnabled}
                  onClick={onToggleLottery}
                  aria-label={lottery.toggleAriaLabel}
                >
                  <span className="toggle-handle" />
                </button>
                <span className="toggle-state-text">
                  {lotteryEnabled
                    ? lottery.toggleOnLabel
                    : lottery.toggleOffLabel}
                </span>
              </div>
            </div>
          </div>
        </>
      )}
      {collapsed && (
        <div
          className="pinned-summary"
          title={ui.pinned.title}
          onClick={onToggleCollapse}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") onToggleCollapse();
          }}
        >
          <div className="pinned-row">
            <span>{ui.pinned.occupation}</span>
            <span className="pinned-value">{occupationDisplay}</span>
          </div>
          <div className="pinned-row">
            <span>{ui.pinned.salary}</span>
            <span className="pinned-value">{salaryDisplay}</span>
          </div>
        </div>
      )}

      {/* Legend stays visible even when collapsed */}
      <div className="legend" title={ui.legendTitle}>
        <LegendItem color={levels.colors[1]} label={levels.labels.legend[1]} />
        <LegendItem color={levels.colors[2]} label={levels.labels.legend[2]} />
        <LegendItem color={levels.colors[3]} label={levels.labels.legend[3]} />
        <LegendItem color={levels.colors[4]} label={levels.labels.legend[4]} />
        <LegendItem color={levels.colors[0]} label={levels.labels.legend[0]} />
        <LegendItem pattern label={levels.labels.legend.noData} />
      </div>

      {!collapsed && (
        <>
          {/* Footer */}
          <div className="footer">
            <div className="footer-left">
              <button
                type="button"
                onClick={handleShare}
                aria-label={ui.share.ariaLabel}
                title={ui.share.title}
                className="icon-button"
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7a2.5 2.5 0 000-1.39l7.02-4.11A2.99 2.99 0 0018 7.91a3 3 0 10-3-3c0 .23.03.45.08.66L8.05 9.7a3 3 0 100 4.61l7.02 4.11c-.05.2-.07.41-.07.63a3 3 0 103-3z" />
                </svg>
              </button>
              <a
                className="icon-link"
                href={links.repoUrl}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={links.repoLabel}
                title={links.repoLabel}
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path d="M12 0C5.37 0 0 5.37 0 12c0 5.3 3.44 9.8 8.21 11.39.6.11.82-.26.82-.58 0-.29-.01-1.04-.02-2.05-3.34.73-4.04-1.61-4.04-1.61-.55-1.39-1.34-1.76-1.34-1.76-1.09-.75.08-.73.08-.73 1.21.09 1.85 1.24 1.85 1.24 1.07 1.84 2.81 1.31 3.5 1 .11-.78.42-1.31.76-1.61-2.67-.3-5.47-1.33-5.47-5.93 0-1.31.47-2.38 1.24-3.22-.12-.3-.54-1.52.12-3.18 0 0 1.01-.32 3.3 1.23A11.5 11.5 0 0112 6.8c1.02 0 2.05.14 3.01.4 2.29-1.55 3.3-1.23 3.3-1.23.66 1.66.24 2.88.12 3.18.77.84 1.24 1.91 1.24 3.22 0 4.61-2.81 5.62-5.49 5.92.43.37.81 1.1.81 2.22 0 1.61-.01 2.91-.01 3.31 0 .32.22.7.82.58C20.56 21.8 24 17.3 24 12 24 5.37 18.63 0 12 0z" />
                </svg>
              </a>
            </div>

            {/* add a disclosures link same like oflc-link */}

            <a
              className="disclosures-link"
              href={links.disclosures}
              target="_blank"
              rel="noopener noreferrer"
            >
              {links.disclosuresLabel}
            </a>

            <a
              className="oflc-link"
              href={links.oflc}
              target="_blank"
              rel="noopener noreferrer"
            >
              {links.oflcLabel}
            </a>

            <a
              className="oflc-link"
              href={links.repoUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              {links.repoLabel}
            </a>
          </div>

          <div className="credit">
            <a href={links.authorUrl} target="_blank" rel="noopener noreferrer">
              {links.authorName}
            </a>
          </div>
        </>
      )}
    </div>
  );
}
