import PropTypes from "prop-types";
import { useEffect, useMemo, useRef, useState } from "react";
import * as echarts from "echarts";
import * as turf from "@turf/turf";

const MapChartEditable = ({
  geoData,
  mapName = "TrackMapEditable",
  gates ,
  width = "100%",
  height = "100%",
  gatePointCount = 20,
  rotation = 0,
  onMapClick,       
  onPointRightClick 
}) => {
  const chartRef = useRef(null);
  const chartInstance = useRef(null);
  const [processedGeoData, setProcessedGeoData] = useState(null);

  // --- Helpers from Original Chart ---
  const isValidCoord = (coords) => {
    return (
      Array.isArray(coords) &&
      coords.length >= 2 &&
      Number.isFinite(coords[0]) &&
      Number.isFinite(coords[1])
    );
  };

  const rotatePoint = (coords, angle, pivot) => {
    if (angle === 0 || !pivot || !isValidCoord(coords)) return coords;
    try {
      const pt = turf.point(coords);
      const rotated = turf.transformRotate(pt, angle, { pivot });
      return rotated.geometry.coordinates;
    } catch (e) {
      return coords;
    }
  };

    const unrotatePoint = (coords, angle, pivot) => {
        if (angle === 0 || !pivot) return coords;
            try {
                const pt = turf.point(coords);
                // We use the NEGATIVE angle to reverse the visual rotation
                const unrotated = turf.transformRotate(pt, -angle, { pivot });
                return unrotated.geometry.coordinates;
            } catch (e) {
                return coords;
            }
    };

  const mapCenter = useMemo(() => {
    if (!geoData) return null;
    try { return turf.center(geoData); } catch (e) { return null; }
  }, [geoData]);

  // Handle Map Registration and Rotation
  useEffect(() => {
    if (!geoData || !chartRef.current) return;
    let mapDataToRegister = geoData;

    if (rotation !== 0 && mapCenter) {
      try {
        mapDataToRegister = turf.transformRotate(geoData, rotation, { pivot: mapCenter });
      } catch (e) { console.error(e); }
    }

    echarts.registerMap(mapName, mapDataToRegister);
    setProcessedGeoData(mapDataToRegister);

    if (!chartInstance.current) {
      chartInstance.current = echarts.init(chartRef.current);
      
    chartInstance.current.getZr().on('click', (params) => {
        const pointInPixel = [params.offsetX, params.offsetY];
        const pointInGeo = chartInstance.current.convertFromPixel('geo', pointInPixel);
        
        if (pointInGeo && onMapClick) {
            // Step 1: Reverse the rotation so the coordinates match your raw JSON
            const [rawLon, rawLat] = unrotatePoint(pointInGeo, rotation, mapCenter);
            
            // Step 2: Send the 'Raw' GPS coordinates back to the parent
            onMapClick({ lon: rawLon, lat: rawLat });
        }
    });
      chartRef.current.oncontextmenu = (e) => e.preventDefault(); 
      chartInstance.current.on('contextmenu', (params) => {
        if (params.seriesName === "Gates" && onPointRightClick) {
            onPointRightClick(params.data.gateIndex);
        }
      });
    }
  }, [geoData, mapName, rotation, mapCenter, onMapClick, onPointRightClick]);

  // --- FIX: Process & Rotate Gate Points (Matches Original Logic) ---
  // Inside MapChartEditable.jsx
const gatePoints = useMemo(() => {
  const raw = Array.isArray(gates) ? gates : [];
  let pts = [];

  raw.forEach((gate, index) => {
    const { lon1, lat1, lon2, lat2, name } = gate;
    
    // Only interpolate if the second point is different from the first
    const isFinished = Number.isFinite(lon2) && 
                       Number.isFinite(lat2) && 
                       (lon1 !== lon2 || lat1 !== lat2);
                       
    const count = isFinished ? gatePointCount : 0;

    for (let i = 0; i <= count; i++) {
      const t = count === 0 ? 0 : i / count;
      const lon = lon1 + (lon2 - lon1) * t;
      const lat = lat1 + (lat2 - lat1) * t;
      
      pts.push({
        name: name || `Gate ${index}`,
        gateIndex: index,
        value: [lon, lat],
      });
    }
  });

  // Apply rotation to the points after interpolation
  if (rotation !== 0 && mapCenter) {
    pts = pts.map((pt) => ({
      ...pt,
      value: rotatePoint(pt.value, rotation, mapCenter),
    }));
  }

  return pts;
}, [gates, gatePointCount, rotation, mapCenter]);

  useEffect(() => {
    if (!chartInstance.current || !processedGeoData) return;

    chartInstance.current.setOption({
      geo: {
        map: mapName,
        roam: true,
        left: "center",
        top: "middle",
        itemStyle: { areaColor: "#eee", borderColor: "#000", borderWidth: 0.7 },
      },
      series: [
        {
          name: "Gates",
          type: "scatter",
          coordinateSystem: "geo",
          symbolSize: 10,
          itemStyle: { color: "#000" },
          data: gatePoints,
          zlevel: 2,
        },
      ],
    }, { notMerge: true });
  }, [gatePoints, processedGeoData, mapName]);

  return (
    <div style={{ width, height }}>
      <div ref={chartRef} style={{ width: "100%", height: "100%" }} />
    </div>
  );
};

export default MapChartEditable;