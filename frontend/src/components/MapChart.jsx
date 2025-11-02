// MapChart.jsx
import PropTypes from "prop-types";
import { useEffect, useMemo, useRef } from "react";
import * as echarts from "echarts";

const MapChart = ({
  geoData,
  mapName = "TrackMap",
  data,
  gates = [],
  width = 500,
  height = 600,
  gatePointCount = 20, // number of black points per gate
}) => {
  const chartRef = useRef(null);
  const chart = useRef(null);

  useEffect(() => {
    if (!geoData) return;
    echarts.registerMap(mapName, geoData);
    chart.current = echarts.init(chartRef.current);
    return () => chart.current?.dispose();
  }, [geoData, mapName]);

  // seconds → ms (accepts numbers/strings); leave undefined if missing
  const toMs = (t) => {
    if (t == null) return undefined;
    const n = Number(t);
    if (!Number.isFinite(n)) return undefined;
    return n < 2e10 ? n * 1000 : n; // treat small epoch values as seconds
  };

  // Format time as HH:MM:SS.mmm (no date)
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const fmtTime = (ms) =>
    new Intl.DateTimeFormat(undefined, {
      timeZone: tz,
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      fractionalSecondDigits: 3,
    }).format(ms);

  // Build GPS points, accepting either arrays [lon,lat,speed,ts?] or objects
  const gpsPoints = useMemo(() => {
    const rows = Array.isArray(data) ? data : [];
    const pts = [];

    for (const d of rows) {
      if (Array.isArray(d)) {
        const [lon, lat, speed, ts] = d;
        pts.push({ value: [lon, lat, speed, toMs(ts)] });
      } else if (d && typeof d === "object") {
        const lon = d.lon ?? d.lng ?? d.longitude;
        const lat = d.lat ?? d.latitude;
        const speed = d.speed ?? d.v ?? 0;
        const ts = d.ts ?? d.time;
        pts.push({ name: d.name ?? "", value: [lon, lat, speed, toMs(ts)] });
      }
    }
    return pts;
  }, [data]);

  const gatePoints = useMemo(() => {
    const raw = Array.isArray(gates) ? gates : gates?.gates || [];
    const pts = [];

    raw.forEach(({ lon1, lat1, lon2, lat2, name }) => {
      for (let i = 0; i <= gatePointCount; i++) {
        const t = i / gatePointCount;
        pts.push({
          name: name ?? "",
          value: [lon1 + (lon2 - lon1) * t, lat1 + (lat2 - lat1) * t, 0],
        });
      }
    });

    return pts;
  }, [gates, gatePointCount]);

  useEffect(() => {
    if (!chart.current || !geoData) return;

    chart.current.setOption(
      {
        geo: {
          map: mapName,
          roam: true,
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
          bottom: 10,
          inRange: {
            color: ["#2c7bb6", "#1dfdec", "#00ff00", "#eaff00", "#d7191c"],
          },
          text: ["Fast", "Slow"],
          seriesIndex: 0,  // apply to GPS series only
          dimension: 2,    // color by speed (value[2])
        },
        tooltip: {
          trigger: "item",
          formatter: (p) => {
            if (p.seriesName === "GPS") {
              const speed = p.value?.[2];
              const tms = p.value?.[3];
              const t = Number.isFinite(tms) ? fmtTime(tms) : "—";
              return `Time: ${t}<br/>Speed: ${speed} km/h`;
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
            data: gpsPoints, // value = [lon, lat, speed, timeMs?]
            zlevel: 1,
          },
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
      },
      { notMerge: true }
    );
  }, [gpsPoints, gatePoints, geoData, mapName]);

  if (!geoData) return null;

  return (
    <div style={{ width, height }}>
      <div ref={chartRef} style={{ width: "100%", height: "100%" }} />
    </div>
  );
};

MapChart.propTypes = {
  geoData: PropTypes.object,
  mapName: PropTypes.string,
  // Accept arrays OR objects (see mapper above)
  data: PropTypes.arrayOf(PropTypes.oneOfType([PropTypes.array, PropTypes.object])).isRequired,
  gates: PropTypes.oneOfType([
    PropTypes.arrayOf(
      PropTypes.shape({
        lon1: PropTypes.number.isRequired,
        lat1: PropTypes.number.isRequired,
        lon2: PropTypes.number.isRequired,
        lat2: PropTypes.number.isRequired,
        name: PropTypes.string,
      })
    ),
    PropTypes.object,
  ]),
  width: PropTypes.number,
  height: PropTypes.number,
  gatePointCount: PropTypes.number,
};

export default MapChart;
