export function firstExistingLayerId(map, layerIds = []) {
  return layerIds.find((id) => map.getLayer(id));
}

export function restyleBasemapForContrast(map, mapConfig) {
  const labelPaint = mapConfig.paint.labels;
  (mapConfig.basemap.labelLayerIds || []).forEach((id) => {
    if (!map.getLayer(id)) return;
    map.setPaintProperty(id, "text-color", labelPaint.color);
    map.setPaintProperty(id, "text-halo-color", labelPaint.haloColor);
    map.setPaintProperty(id, "text-halo-width", labelPaint.haloWidth);
    map.setPaintProperty(id, "text-halo-blur", labelPaint.haloBlur);
  });

  if (map.getLayer("label_state")) {
    map.setLayoutProperty("label_state", "text-size", [
      "interpolate",
      ["linear"],
      ["zoom"],
      4,
      11,
      6,
      13,
      8,
      16,
    ]);
  }

  (mapConfig.basemap.countryBoundaryLayerIds || []).forEach((id) => {
    if (!map.getLayer(id)) return;
    map.setPaintProperty(
      id,
      "line-color",
      mapConfig.paint.countryBoundary.color
    );
  });
}

export function addWageMapLayers(map, counties, mapConfig) {
  map.addSource(mapConfig.sources.counties, {
    type: "geojson",
    data: counties,
  });

  const beforeId = firstExistingLayerId(map, mapConfig.insertBeforeLayerIds);
  restyleBasemapForContrast(map, mapConfig);

  map.addLayer(
    {
      id: mapConfig.layers.countyFill,
      type: "fill",
      source: mapConfig.sources.counties,
      paint: {
        "fill-color": mapConfig.paint.countyFill.color,
        "fill-opacity": mapConfig.paint.countyFill.opacity,
      },
    },
    beforeId
  );

  map.addLayer(
    {
      id: mapConfig.layers.countyNoData,
      type: "fill",
      source: mapConfig.sources.counties,
      filter: ["!", ["has", "level"]],
      paint: {
        "fill-pattern": "no-data-hatch",
        "fill-opacity": 0.85,
      },
    },
    beforeId
  );

  map.addLayer(
    {
      id: mapConfig.layers.countyOutline,
      type: "line",
      source: mapConfig.sources.counties,
      paint: {
        "line-color": mapConfig.paint.countyOutline.color,
        "line-width": mapConfig.paint.countyOutline.width,
        "line-opacity": mapConfig.paint.countyOutline.opacity,
      },
      layout: { "line-join": "round" },
    },
    beforeId
  );

  if (map.getSource(mapConfig.basemap.source)) {
    map.addLayer(
      {
        id: mapConfig.layers.stateOutline,
        type: "line",
        source: mapConfig.basemap.source,
        "source-layer": mapConfig.basemap.boundarySourceLayer,
        minzoom: 3,
        filter: [
          "all",
          ["==", ["get", "admin_level"], 4],
          ["!=", ["get", "maritime"], 1],
        ],
        paint: {
          "line-color": mapConfig.paint.stateOutline.color,
          "line-width": mapConfig.paint.stateOutline.width,
          "line-opacity": mapConfig.paint.stateOutline.opacity,
        },
        layout: { "line-join": "round", "line-cap": "round" },
      },
      beforeId
    );
  }

  map.addLayer({
    id: mapConfig.layers.countyLabel,
    type: "symbol",
    source: mapConfig.sources.counties,
    minzoom: 6,
    layout: {
      "text-field": ["coalesce", ["get", "NAME"], ["get", "NAMELSAD"]],
      "text-font": ["Noto Sans Regular"],
      "text-size": [
        "interpolate",
        ["linear"],
        ["zoom"],
        6,
        10,
        8,
        11.5,
        10,
        13,
      ],
      "text-max-width": 8,
      "text-padding": 4,
      "text-allow-overlap": false,
      "text-optional": true,
    },
    paint: {
      "text-color": mapConfig.paint.countyLabel.color,
      "text-halo-color": mapConfig.paint.countyLabel.haloColor,
      "text-halo-width": mapConfig.paint.countyLabel.haloWidth,
      "text-halo-blur": mapConfig.paint.countyLabel.haloBlur,
    },
  });
}
