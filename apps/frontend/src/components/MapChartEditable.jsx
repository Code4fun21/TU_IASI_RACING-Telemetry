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
      
      // Find the middle index to attach the label to
      const centerIndex = Math.floor(count / 2);

      // --- COLOR LOGIC: 'T' for Turn, 'S' for Sector ---
      let pointColor = gate.color || "#9ca3af"; // Default to gray if no match or prop color

      if (!gate.color && name) {
          const firstChar = name.trim().charAt(0).toUpperCase();
          if (firstChar === 'T') {
              pointColor = "#6b7280"; // Red for Turns
          } else if (firstChar === 'S') {
              pointColor = "#f63b3b"; // Blue for Sectors
          }
      }

      for (let i = 0; i <= count; i++) {
        const t = count === 0 ? 0 : i / count;
        const lon = lon1 + (lon2 - lon1) * t;
        const lat = lat1 + (lat2 - lat1) * t;
        
        // Only true if this is the middle point of the interpolated line
        const isCenterPoint = i === centerIndex; 
        
        pts.push({
          name: name || `Gate ${index}`,
          gateIndex: index,
          value: [lon, lat],
          label: {
            show: isCenterPoint, // <-- CHANGED: Only show on the center point
            formatter: '{b}',
            position: 'top',
            color: '#fff',
            fontSize: 10,
            backgroundColor: 'rgba(0,0,0,0.5)',
            padding: [2, 4],
            borderRadius: 3
          },
          itemStyle: { 
            color: pointColor // Apply the calculated color here
          }
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
    itemStyle: { areaColor: "#eee", borderColor: "#000", borderWidth: 0.7 },
  },
series: [
  {
    name: "Gates",
    type: "scatter",
    coordinateSystem: "geo",
    symbolSize: 8,
    // ECharts uses itemStyle and label from individual data points above
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