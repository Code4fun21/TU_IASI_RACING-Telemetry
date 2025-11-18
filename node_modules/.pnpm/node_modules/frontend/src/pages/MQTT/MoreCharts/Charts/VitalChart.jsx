// src/components/VitalChart.jsx
import PropTypes from "prop-types";
import { useEffect, useMemo, useRef } from "react";
import * as echarts from "echarts";
import ChartWrapper from "../../../../ChartWrapper";
import geoJson from "../../../../../src/components/tracks_data/bacau.json";

const COLORS = ["#5470C6", "#91CC75", "#EE6666", "#73C0DE", "#FAC858"];
const MIN_POINTS_FOR_SCATTER = 20; // below this, emphasize points
const EPS_MS = 0.001;              // minimal bump to ensure strictly increasing ms

export default function VitalChart({
  dateTime = [],       // shared X in ms (your current usage)
  series   = [],       // [{ name, data: number[] OR [ms,val][], unit }]
  height   = 500,
  group    = null,
  windowMs = null,     // fixed scrolling window length in ms (null = free zoom)
}) {
  const chartRef = useRef();

  useEffect(() => {
    try { echarts.registerMap("SpeedParkBacau", geoJson); } catch {}
    if (group) echarts.connect(group);
  }, [group]);

  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const fmtMs = (ts) =>
    new Intl.DateTimeFormat(undefined, {
      timeZone: tz,
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      fractionalSecondDigits: 3,
    }).format(ts);

  // ---- helper: enforce strictly increasing timestamps per series ----
  const enforceMonotonic = (pairs) => {
    let last = -Infinity;
    return pairs.map(([ms, v]) => {
      let t = Number(ms);
      if (!Number.isFinite(t)) return null;
      if (t <= last) t = last + EPS_MS; // nudge forward
      last = t;
      return [t, Number(v)];
    }).filter(Boolean);
  };

  // ---------- Normalize to [ms, value] pairs while keeping your API ----------
  const norm = useMemo(() => {
    const dt = Array.isArray(dateTime) ? dateTime : [];
    return series.map((s) => {
      const d = Array.isArray(s.data) ? s.data : [];

      const looksLikePairs =
        Array.isArray(d[0]) && d[0].length >= 2 && Number.isFinite(d[0][0]);

      let pairs;
      if (looksLikePairs) {
        pairs = d
          .map(([ms, v]) => [Number(ms), Number(v)])
          .filter(([ms, v]) => Number.isFinite(ms) && Number.isFinite(v))
          .sort((a, b) => a[0] - b[0]);
      } else {
        const n = Math.min(dt.length, d.length);
        pairs = [];
        for (let i = 0; i < n; i++) {
          const ms = Number(dt[i]);
          const v  = Number(d[i]);
          if (Number.isFinite(ms) && Number.isFinite(v)) pairs.push([ms, v]);
        }
        pairs.sort((a, b) => a[0] - b[0]);
      }

      // key addition: ensure strictly increasing time for this series
      return { ...s, data: enforceMonotonic(pairs) };
    });
  }, [dateTime, series]);

  // y-axes (one per series)
  const yAxis = norm.map((s, i) => ({
    type: "value",
    name: s.name,
    position: i === 0 ? "left" : "right",
    offset: i >= 2 ? (i - 1) * 65 : 0,
    axisLine: { lineStyle: { color: COLORS[i % COLORS.length] } },
    axisLabel: { formatter: `{value} ${s.unit || ""}` },
  }));

  // global time span
  const { minTs, maxTs, span, maxN, isSparse } = useMemo(() => {
    const allT = norm.flatMap(s => s.data.map(p => p[0])).filter(Number.isFinite);
    const minTs = allT.length ? Math.min(...allT) : undefined;
    const maxTs = allT.length ? Math.max(...allT) : undefined;
    const span  = minTs != null && maxTs != null ? (maxTs - minTs) : 0;
    const maxN  = Math.max(0, ...norm.map(s => s.data.length));
    return { minTs, maxTs, span, maxN, isSparse: maxN > 0 && maxN < MIN_POINTS_FOR_SCATTER };
  }, [norm]);

  const minInterval =
    span <= 30_000 ? 1       :
    span <= 3_600_000 ? 1_000 :
    60_000;

  // time padding when sparse
  let xMin, xMax;
  if (isSparse && minTs != null && maxTs != null) {
    const pad = Math.max(5, Math.round(span * 0.05));
    xMin = minTs - pad; xMax = maxTs + pad;
  }

  // series options (scatter when sparse, line otherwise)
  const seriesOpts = norm.map((s, i) => {
    const color = COLORS[i % COLORS.length];
    const base  = {
      name: s.name,
      yAxisIndex: i,
      data: s.data,
      emphasis: { focus: "series" },
    };
    return isSparse
      ? { ...base, type: "scatter", symbolSize: 8, itemStyle: { color }, z: 3 }
      : { ...base, type: "line", showSymbol: false, sampling: "lttb",
          lineStyle: { color, width: 2 } };
  });

  // dataZoom components (keep the bottom slider; remove toolbox zoom buttons)
  const sliderZoom = useMemo(() => {
    if (minTs == null || maxTs == null) {
      return [
        { type: "inside", throttle: 50 },
        { type: "slider", height: 18, bottom: 8 },
      ];
    }
    if (!windowMs || windowMs <= 0 || windowMs >= span) {
      return [
        { type: "inside", throttle: 50 },
        { type: "slider", height: 18, bottom: 8, filterMode: "none" },
      ];
    }
    const startValue = Math.max(minTs, maxTs - windowMs);
    const endValue   = startValue + windowMs;
    return [
        { type: "inside", throttle: 50, zoomOnMouseWheel: "shift",
          moveOnMouseMove: true, moveOnMouseWheel: true, zoomLock: true, xAxisIndex: [0] },
        { type: "slider", height: 18, bottom: 8, filterMode: "none",
          startValue, endValue, zoomLock: true, brushSelect: false, handleSize: 12 },
    ];
  }, [minTs, maxTs, span, windowMs]);

  const options = {
    color: COLORS,
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "cross" },
      formatter: (params) => {
        const ts = params[0]?.value?.[0];
        let out = `<b>${fmtMs(ts)}</b><br/>`;
        params.forEach((p) => {
          const unit = norm[p.seriesIndex]?.unit ?? "";
          out += `<span style="color:${p.color}">●</span> ${p.seriesName}: ${p.value[1]} ${unit}<br/>`;
        });
        return out;
      },
    },
    // TOOLBOX: removed the first two buttons (the dataZoom toolbar icons)
    // Keep ONLY the last two: Restore & Save as image
    toolbox: {
      right: 10,
      feature: {
        // dataZoom: { yAxisIndex: "none" }, // <-- removed
        restore: {},
        saveAsImage: {},
      },
    },
    grid: { right: "22%", left: "10%", top: 30, bottom: 55 },
    xAxis: {
      type: "time",
      min: xMin, max: xMax,
      boundaryGap: false,
      minInterval,
      axisLabel: { hideOverlap: true, formatter: (val) => fmtMs(val) },
      axisPointer: { label: { formatter: ({ value }) => fmtMs(value) } },
      scale: true,
    },
    yAxis,
    series: seriesOpts,
    dataZoom: sliderZoom,
  };

  return (
    <div ref={chartRef} style={{ height }}>
      <ChartWrapper options={options} style={{ width: "100%", height: "100%" }} />
    </div>
  );
}

VitalChart.propTypes = {
  dateTime: PropTypes.arrayOf(PropTypes.number),
  series: PropTypes.arrayOf(
    PropTypes.shape({
      name: PropTypes.string.isRequired,
      unit: PropTypes.string,
      data: PropTypes.array.isRequired, // number[] or [ms,val][]
    })
  ).isRequired,
  height: PropTypes.number,
  group: PropTypes.string,
  windowMs: PropTypes.number,
};
