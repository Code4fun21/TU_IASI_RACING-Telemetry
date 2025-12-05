// MapChart.jsx
import PropTypes from "prop-types";
import { useEffect, useMemo, useRef, useState } from "react";
import * as echarts from "echarts";
// 1. Import Turf.js for geospatial calculations
import * as turf from "@turf/turf";

const MapChart = ({
  geoData,
  mapName = "TrackMap",
  data,
  gates = [],
  width = "100%",
  height = "100%",
  gatePointCount = 20,
  rotation = 0, // New prop: Rotation angle in degrees (e.g., 90)
}) => {
  const chartRef = useRef(null);
  const chart = useRef(null);
  // We'll store the (potentially rotated) map data here
  const [processedGeoData, setProcessedGeoData] = useState(null);

  // --- Helpers ---
  const toMs = (t) => {
    if (t == null) return undefined;
    const n = Number(t);
    if (!Number.isFinite(n)) return undefined;
    return n < 2e10 ? n * 1000 : n;
  };

  const fmtTime = (ms) => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return new Intl.DateTimeFormat(undefined, {
      timeZone: tz,
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      fractionalSecondDigits: 3,
    }).format(ms);
  };

  // Helper to rotate a single [lon, lat] point around a pivot
  const rotatePoint = (coords, angle, pivot) => {
    if (angle === 0 || !pivot) return coords;
    const pt = turf.point(coords);
    const rotated = turf.transformRotate(pt, angle, { pivot });
    return rotated.geometry.coordinates;
  };

  // --- 1. Process Map Data (Calculate Center & Rotate) ---
  // Find the center of the map to use as a pivot point for rotation
  const mapCenter = useMemo(() => geoData ? turf.center(geoData) : null, [geoData]);

  useEffect(() => {
    if (!geoData || !chartRef.current) return;

    let mapDataToRegister = geoData;

    // If a rotation is provided, mathematically rotate the GeoJSON
    if (rotation !== 0 && mapCenter) {
      mapDataToRegister = turf.transformRotate(geoData, rotation, {
        pivot: mapCenter,
      });
    }

    // Register the map (either original or rotated)
    echarts.registerMap(mapName, mapDataToRegister);
    setProcessedGeoData(mapDataToRegister);

    // Initialize chart if not already done
    if (!chart.current) {
      chart.current = echarts.init(chartRef.current);
    }
    
    // Cleanup
    return () => {
      // We don't dispose here to avoid flashing, but in a real app 
      // you might handle cleanup more carefully on unmount.
    };
  }, [geoData, mapName, rotation, mapCenter]);


  // --- 2. Process & Rotate GPS Points ---
  const gpsPoints = useMemo(() => {
    const rows = Array.isArray(data) ? data : [];
    let pts = [];

    // First, normalize data
    for (const d of rows) {
      if (Array.isArray(d)) {
        const [lon, lat, speed, ts] = d;
        pts.push({ value: [lon, lat, speed, toMs(ts)] });
      } else if (d && typeof d === "object") {
        pts.push({
          name: d.name ?? "",
          value: [d.lon ?? d.lng, d.lat, d.speed ?? d.v ?? 0, toMs(d.ts ?? d.time)],
        });
      }
    }

    // Then, rotate points if necessary
    if (rotation !== 0 && mapCenter) {
      pts = pts.map((pt) => {
        const [lon, lat, speed, time] = pt.value;
        // Rotate only the coordinate part ([lon, lat])
        const rotatedCoords = rotatePoint([lon, lat], rotation, mapCenter);
        return { ...pt, value: [...rotatedCoords, speed, time] };
      });
    }

    return pts;
  }, [data, rotation, mapCenter]);


  // --- 3. Process & Rotate Gate Points ---
  const gatePoints = useMemo(() => {
    const raw = Array.isArray(gates) ? gates : gates?.gates || [];
    let pts = [];

    // First, generate interpolated points
    raw.forEach(({ lon1, lat1, lon2, lat2, name }) => {
      for (let i = 0; i <= gatePointCount; i++) {
        const t = i / gatePointCount;
        pts.push({
          name: name ?? "",
          value: [lon1 + (lon2 - lon1) * t, lat1 + (lat2 - lat1) * t],
        });
      }
    });

    // Then, rotate points if necessary
    if (rotation !== 0 && mapCenter) {
      pts = pts.map((pt) => ({
        ...pt,
        value: rotatePoint(pt.value, rotation, mapCenter),
      }));
    }

    return pts;
  }, [gates, gatePointCount, rotation, mapCenter]);


  // --- 4. Render Chart ---
  useEffect(() => {
    if (!chart.current || !processedGeoData) return;

    chart.current.setOption(
      {
        // Centering is handled by ECharts layout engine now
        geo: {
          map: mapName,
          roam: true,
          // These two properties will center the map in the canvas
          left: "center",
          top: "middle",
          label: { show: false },
          itemStyle: { areaColor: "#eee", borderColor: "#444" },
          emphasis: { itemStyle: { areaColor: "#ccc" } },
        },
        visualMap: {
          min: 0,
          max: 90,
          calculable: true,
          orient: "horizontal",
          // This centers the legend horizontally at the bottom
          left: "center",
          bottom: 20,
          inRange: {
            color: ["#2c7bb6", "#1dfdec", "#00ff00", "#eaff00", "#d7191c"],
          },
          text: ["Fast", "Slow"],
          seriesIndex: 0,
          dimension: 2,
        },
        tooltip: {
          trigger: "item",
          formatter: (p) => {
            if (p.seriesName === "GPS") {
              const speed = p.value?.[2];
              const tms = p.value?.[3];
              const t = Number.isFinite(tms) ? fmtTime(tms) : "—";
              // Speed value is now formatted to 1 decimal place
              return `Time: ${t}<br/>Speed: ${Number(speed).toFixed(1)} km/h`;
            }
            if (p.seriesName === "Gates") return `Gate: ${p.name || ""}`;
            return "";
          },
        },
        series: [
          {
            name: "GPS",
            type: "scatter",
            coordinateSystem: "geo",
            symbolSize: 6,
            data: gpsPoints,
            zlevel: 1,
          },
          // Switched Gates to 'lines' for better performance and cleaner look
          {
            name: "Gates",
            type: "scatter", // Kept as scatter as per original code for now
            coordinateSystem: "geo",
            symbolSize: 10,
            itemStyle: { color: "#000" },
            data: gatePoints,
            zlevel: 2,
          },
        ],
      },
      { notMerge: true }
    );
    
    // Resize handler to keep everything centered on window resize
    const handleResize = () => chart.current?.resize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
    
  }, [gpsPoints, gatePoints, processedGeoData, mapName]);


  return (
    // A flex container ensures the chart div is perfectly centered
    <div style={{ width, height, display: "flex", justifyContent: "center", alignItems: "center" }}>
      <div ref={chartRef} style={{ width: "100%", height: "100%" }} />
    </div>
  );
};

MapChart.propTypes = {
  // ... (other propTypes are the same)
  rotation: PropTypes.number, // New prop type
};

export default MapChart;