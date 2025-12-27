import PropTypes from "prop-types";
import { useEffect, useMemo, useRef, useState } from "react";
import * as echarts from "echarts";
import * as turf from "@turf/turf";

const MapChart = ({
  geoData,
  mapName = "TrackMap",
  data,
  gates ,
  width = "100%",
  height = "100%",
  gatePointCount = 20,
  rotation = 0,
}) => {
  const chartRef = useRef(null);
  const chart = useRef(null);
  const [processedGeoData, setProcessedGeoData] = useState(null);

  // --- Helpers ---
  const toMs = (t) => {
    if (t == null) return undefined;
    const n = Number(t);
    if (!Number.isFinite(n)) return undefined;
    return n < 2e10 ? n * 1000 : n;
  };

  const fmtTime = (ms) => {
    if (!Number.isFinite(ms)) return "--:--:--";
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

  // --- SAFETY FIX: Validate coords before Turf ---
  const isValidCoord = (coords) => {
    return (
      Array.isArray(coords) &&
      coords.length >= 2 &&
      Number.isFinite(coords[0]) &&
      Number.isFinite(coords[1])
    );
  };

  const rotatePoint = (coords, angle, pivot) => {
    // If no rotation or invalid inputs, return original
    if (angle === 0 || !pivot || !isValidCoord(coords)) return coords;
    
    try {
        const pt = turf.point(coords);
        const rotated = turf.transformRotate(pt, angle, { pivot });
        return rotated.geometry.coordinates;
    } catch (e) {
        // Fallback if turf fails
        return coords;
    }
  };

  // --- 1. Process Map Data ---
  const mapCenter = useMemo(() => {
     if (!geoData) return null;
     try {
         return turf.center(geoData);
     } catch (e) {
         console.warn("Invalid GeoJSON for Map Center:", e);
         return null;
     }
  }, [geoData]);

  useEffect(() => {
    if (!geoData || !chartRef.current) return;

    let mapDataToRegister = geoData;

    if (rotation !== 0 && mapCenter) {
      try {
        mapDataToRegister = turf.transformRotate(geoData, rotation, {
          pivot: mapCenter,
        });
      } catch (e) {
        console.error("Failed to rotate map layout:", e);
      }
    }

    echarts.registerMap(mapName, mapDataToRegister);
    setProcessedGeoData(mapDataToRegister);

    if (!chart.current) {
      chart.current = echarts.init(chartRef.current);
    }
  }, [geoData, mapName, rotation, mapCenter]);


  // --- 2. Process & Rotate GPS Points ---
  const gpsPoints = useMemo(() => {
    const rows = Array.isArray(data) ? data : [];
    let pts = [];

    for (const d of rows) {
      if (Array.isArray(d)) {
        const [lon, lat, speed, ts] = d;
        if (Number.isFinite(lon) && Number.isFinite(lat)) {
            pts.push({ value: [lon, lat, speed, toMs(ts)] });
        }
      } else if (d && typeof d === "object") {
        const lon = d.lon ?? d.lng;
        const lat = d.lat;
        if (Number.isFinite(lon) && Number.isFinite(lat)) {
            pts.push({
            name: d.name ?? "",
            value: [lon, lat, d.speed ?? d.v ?? 0, toMs(d.ts ?? d.time)],
            });
        }
      }
    }

    // Rotate points
    if (rotation !== 0 && mapCenter) {
      pts = pts.map((pt) => {
        const [lon, lat, speed, time] = pt.value;
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

    raw.forEach((gate) => {
      // Ensure all coordinates exist and are numbers
      const { lon1, lat1, lon2, lat2, name } = gate;
      
      if (
        [lon1, lat1, lon2, lat2].some(v => !Number.isFinite(v))
      ) {
        return; // Skip invalid gates
      }

      for (let i = 0; i <= gatePointCount; i++) {
        const t = i / gatePointCount;
        // Interpolate
        const lon = lon1 + (lon2 - lon1) * t;
        const lat = lat1 + (lat2 - lat1) * t;
        
        pts.push({
          name: name ?? "",
          value: [lon, lat],
        });
      }
    });

    // Rotate
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
        geo: {
          map: mapName,
          roam: true,
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
          {
            name: "Gates",
            type: "scatter",
            coordinateSystem: "geo",
            symbolSize: 8,
            itemStyle: { color: "#000" },
            data: gatePoints,
            zlevel: 2,
          },
        ],
      },
      { notMerge: true }
    );
    
    const handleResize = () => chart.current?.resize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
    
  }, [gpsPoints, gatePoints, processedGeoData, mapName]);


  return (
    <div style={{ width, height, display: "flex", justifyContent: "center", alignItems: "center" }}>
      <div ref={chartRef} style={{ width: "100%", height: "100%" }} />
    </div>
  );
};

MapChart.propTypes = {
  geoData: PropTypes.object,
  mapName: PropTypes.string,
  data: PropTypes.array,
  gates: PropTypes.oneOfType([PropTypes.array, PropTypes.object]),
  width: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
  height: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
  gatePointCount: PropTypes.number,
  rotation: PropTypes.number,
};

export default MapChart;