import React from "react";

export default function LegendItem({ color, label, pattern = false }) {
  return (
    <div className="legend-item">
      <span
        className={`legend-swatch${pattern ? " legend-swatch-hatch" : ""}`}
        style={pattern ? undefined : { background: color }}
      />
      <span>{label}</span>
    </div>
  );
}
