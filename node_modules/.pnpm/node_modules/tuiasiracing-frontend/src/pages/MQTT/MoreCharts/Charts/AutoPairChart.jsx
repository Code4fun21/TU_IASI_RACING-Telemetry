import PropTypes from "prop-types";
import { useMemo } from "react";
import * as echarts from "echarts";
import ChartWrapper from "../../../../ChartWrapper";

const COLORS = ["#5470C6", "#91CC75", "#EE6666", "#73C0DE", "#FAC858"];
const MIN_POINTS_FOR_SCATTER = 20;
const EPS = 0.001;

function toNumberTs(t) {
  const n = Number(t);
  return Number.isFinite(n) ? n : Date.parse(t);
}

// make strictly increasing
function enforceMonotonic(pairs) {
  let last = -Infinity;
  const out = [];
  for (let i = 0; i < pairs.length; i++) {
    let [t, v] = pairs[i];
    t = toNumberTs(t);
    v = Number(v);
    if (!Number.isFinite(t) || !Number.isFinite(v)) continue;
    if (t <= last) t = last + EPS;
    last = t;
    out.push([t, v]);
  }
  return out;
}

// binary search lower bound
function lb(pairs, x) {
  let lo = 0, hi = pairs.length;
  while (lo < hi) {
    const m = (lo + hi) >> 1;
    if (pairs[m][0] < x) lo = m + 1; else hi = m;
  }
  return lo;
}

function sampleToGrid(pairs, grid, { method = "linear", tol = 500 }) {
  if (!pairs.length) return grid.map(t => [t, null]);
  const out = new Array(grid.length);
  for (let i = 0; i < grid.length; i++) {
    const t = grid[i];
    const k = lb(pairs, t);
    let y = null;

    if (method === "nearest") {
      const L = k - 1, R = Math.min(k, pairs.length - 1);
      let best = null, bestDt = Infinity;
      if (L >= 0) { const dt = Math.abs(pairs[L][0] - t); if (dt < bestDt) { bestDt = dt; best = pairs[L][1]; } }
      if (R >= 0) { const dt = Math.abs(pairs[R][0] - t); if (dt < bestDt) { bestDt = dt; best = pairs[R][1]; } }
      y = bestDt <= tol ? best : null;
    } else if (method === "ffill") {
      const L = k - 1;
      if (L >= 0 && (t - pairs[L][0]) <= tol) y = pairs[L][1];
    } else {
      const i0 = k - 1, i1 = k;
      if (i0 >= 0 && i1 < pairs.length) {
        const [t0, v0] = pairs[i0], [t1, v1] = pairs[i1];
        const span = t1 - t0;
        if (span > 0 && (t - t0) <= tol && (t1 - t) <= tol) {
          const a = (t - t0) / span;
          y = v0 + a * (v1 - v0);
        }
      }
    }
    out[i] = [t, y];
  }
  return out;
}

// choose the fastest series as base (smallest median dt)
function pickFastestGrid(seriesPairs) {
  const med = arr => {
    if (!arr.length) return Infinity;
    const s = [...arr].sort((a,b)=>a-b), m = s.length >> 1;
    return s.length % 2 ? s[m] : 0.5*(s[m-1]+s[m]);
  };
  let bestIdx = 0, bestDt = Infinity;
  for (let i = 0; i < seriesPairs.length; i++) {
    const p = seriesPairs[i];
    const dts = [];
    for (let k = 1; k < p.length; k++) {
      const dt = p[k][0] - p[k-1][0];
      if (dt > 0) dts.push(dt);
    }
    const m = med(dts);
    if (m < bestDt) { bestDt = m; bestIdx = i; }
  }
  return seriesPairs[bestIdx].map(([t]) => t);
}

export default function AutoPairChart({
  series = [],          // [{ name, unit, time:[], data:[] } or { pairs:[ [ms,val], ... ] }]
  height = 500,
  group = null,
  align = "none",       // "none" | "base-fastest"
  alignMethod = "linear",
  toleranceMs = 500,
  windowMs = null,
}) {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const fmtMs = (ts) =>
    new Intl.DateTimeFormat(undefined, {
      timeZone: tz, hour12: false,
      hour: "2-digit", minute: "2-digit", second: "2-digit",
      fractionalSecondDigits: 3,
    }).format(ts);

  // Build per-series pairs
  const pairsPerSeries = useMemo(() => {
    return series.map((s) => {
      if (Array.isArray(s.pairs)) {
        return { ...s, pairs: enforceMonotonic(s.pairs.slice().sort((a,b)=>toNumberTs(a[0])-toNumberTs(b[0]))) };
      }
      const t = Array.isArray(s.time) ? s.time : [];
      const y = Array.isArray(s.data) ? s.data : [];
      const n = Math.min(t.length, y.length);
      const pairs = new Array(n);
      for (let i = 0; i < n; i++) pairs[i] = [t[i], y[i]];
      return { ...s, pairs: enforceMonotonic(pairs.sort((a,b)=>toNumberTs(a[0])-toNumberTs(b[0]))) };
    });
  }, [series]);

  // Optional alignment to fastest grid
  const aligned = useMemo(() => {
    if (align !== "base-fastest" || pairsPerSeries.length === 0)
      return pairsPerSeries.map(s => ({ ...s, data: s.pairs }));

    const grid = pickFastestGrid(pairsPerSeries.map(s => s.pairs));
    return pairsPerSeries.map(s => ({
      ...s,
      data: sampleToGrid(s.pairs, grid, { method: alignMethod, tol: toleranceMs }),
    }));
  }, [pairsPerSeries, align, alignMethod, toleranceMs]);

  // If we didn't realign, use original pairs
  const ready = useMemo(() => {
    if (align === "base-fastest")
      return aligned;
    return pairsPerSeries.map(s => ({ ...s, data: s.pairs }));
  }, [aligned, pairsPerSeries, align]);

  // Global x span
  const allT = ready.flatMap(s => s.data.map(p => p[0])).filter(Number.isFinite);
  const minTs = allT.length ? Math.min(...allT) : undefined;
  const maxTs = allT.length ? Math.max(...allT) : undefined;
  const span  = (minTs != null && maxTs != null) ? (maxTs - minTs) : 0;

  const isSparse = Math.max(0, ...ready.map(s => s.data.length)) < MIN_POINTS_FOR_SCATTER;

  let xMin, xMax;
  if (isSparse && minTs != null && maxTs != null) {
    const pad = Math.max(5, Math.round(span * 0.05));
    xMin = minTs - pad; xMax = maxTs + pad;
  }

  const yAxis = ready.map((s, i) => ({
    type: "value",
    name: s.name,
    position: i === 0 ? "left" : "right",
    offset: i >= 2 ? (i - 1) * 65 : 0,
    axisLine: { lineStyle: { color: COLORS[i % COLORS.length] } },
    axisLabel: { formatter: `{value} ${s.unit || ""}` },
  }));

  const seriesOpts = ready.map((s, i) => {
  const color = COLORS[i % COLORS.length];
  return {
    name: s.name,
    yAxisIndex: i,
    type: "line",                 // always line
    data: s.data,
    emphasis: { focus: "series" },
    lineStyle: { color, width: 2 },
    showSymbol: false,
    sampling: "lttb",
    connectNulls: true,           // <-- makes it visually continuous
  };
});


  const dataZoom = useMemo(() => {
    if (minTs == null || maxTs == null) {
      return [{ type: "inside", throttle: 50 }, { type: "slider", height: 18, bottom: 8 }];
    }
    if (!windowMs || windowMs <= 0 || windowMs >= span) {
      return [{ type: "inside", throttle: 50 }, { type: "slider", height: 18, bottom: 8, filterMode: "none" }];
    }
    const startValue = Math.max(minTs, maxTs - windowMs);
    return [
      { type: "inside", throttle: 50, zoomOnMouseWheel: "shift", moveOnMouseMove: true, moveOnMouseWheel: true, zoomLock: true, xAxisIndex: [0] },
      { type: "slider", height: 18, bottom: 8, filterMode: "none", startValue, endValue: startValue + windowMs, zoomLock: true, brushSelect: false, handleSize: 12 },
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
          const unit = ready[p.seriesIndex]?.unit ?? "";
          out += `<span style="color:${p.color}">●</span> ${p.seriesName}: ${p.value[1]} ${unit}<br/>`;
        });
        return out;
      },
    },
    toolbox: { right: 10, feature: { restore: {}, saveAsImage: {} } },
    grid: { right: "22%", left: "10%", top: 30, bottom: 55 },
    xAxis: { type: "time", min: xMin, max: xMax, boundaryGap: false, axisLabel: { hideOverlap: true, formatter: (v) => fmtMs(v) }, axisPointer: { label: { formatter: ({ value }) => fmtMs(value) } }, scale: true },
    yAxis,
    series: seriesOpts,
    dataZoom,
  };

  return <ChartWrapper options={options} style={{ width: "100%", height }} />;
}

AutoPairChart.propTypes = {
  series: PropTypes.arrayOf(PropTypes.shape({
    name: PropTypes.string.isRequired,
    unit: PropTypes.string,
    // Either provide time+data OR pairs
    time: PropTypes.array,
    data: PropTypes.array,
    pairs: PropTypes.array,
  })).isRequired,
  height: PropTypes.number,
  group: PropTypes.string,
  align: PropTypes.oneOf(["none", "base-fastest"]),
  alignMethod: PropTypes.oneOf(["linear", "nearest", "ffill"]),
  toleranceMs: PropTypes.number,
  windowMs: PropTypes.number,
};
