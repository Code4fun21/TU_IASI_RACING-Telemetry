import PropTypes from "prop-types";
import { useMemo } from "react";
import ReactECharts from 'echarts-for-react'; 

const COLORS = ["#5470C6", "#91CC75", "#EE6666", "#73C0DE", "#FAC858"];
const MIN_POINTS_FOR_SCATTER = 20;
const EPS = 0.001;

// --- STATIC HELPER FUNCTIONS ---

function toNumberTs(t) {
  const n = Number(t);
  return Number.isFinite(n) ? n : Date.parse(t);
}

// Detects if 't' is seconds (small) or ms (large) and returns ms
function toMs(t) {
  const n = Number(t);
  if (!Number.isFinite(n)) return NaN;
  // If < 20 billion, it's seconds (year 2603), so multiply by 1000
  return n < 2e10 ? n * 1000 : n;
}

function enforceMonotonic(pairs) {
  if (!Array.isArray(pairs)) return [];
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

function lb(pairs, x) {
  let lo = 0, hi = pairs.length;
  while (lo < hi) {
    const m = (lo + hi) >> 1;
    if (pairs[m][0] < x) lo = m + 1; else hi = m;
  }
  return lo;
}

function sampleToGrid(pairs, grid, { method = "linear", tol = 500 }) {
  if (!pairs || !pairs.length) return grid.map(t => [t, null]);
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

function pickFastestGrid(seriesPairs) {
  const med = arr => {
    if (!arr.length) return Infinity;
    const s = [...arr].sort((a,b)=>a-b), m = s.length >> 1;
    return s.length % 2 ? s[m] : 0.5*(s[m-1]+s[m]);
  };
  let bestIdx = 0, bestDt = Infinity;
  for (let i = 0; i < seriesPairs.length; i++) {
    const p = seriesPairs[i];
    if(!p || p.length < 2) continue;
    const dts = [];
    const step = Math.max(1, Math.floor(p.length / 100)); 
    for (let k = 1; k < p.length; k+=step) {
      const dt = p[k][0] - p[k-1][0];
      if (dt > 0) dts.push(dt);
    }
    const m = med(dts);
    if (m < bestDt) { bestDt = m; bestIdx = i; }
  }
  return seriesPairs[bestIdx] ? seriesPairs[bestIdx].map(([t]) => t) : [];
}

export default function AutoPairChart({
  series = [],
  height = 500,
  align = "none",
  alignMethod = "linear",
  toleranceMs = 500,
  windowMs = null,
}) {
const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;

  const fmtMs = (ts) => {
      try {
          return new Intl.DateTimeFormat(undefined, {
              timeZone: tz, 
              hour12: false,
              hour: "2-digit", 
              minute: "2-digit", 
              second: "2-digit",
              fractionalSecondDigits: 3,
          }).format(ts);
      } catch(e) { 
          return ""; 
      }
  };

  // 1. Build per-series pairs (Memoized)
  const pairsPerSeries = useMemo(() => {
    if (!Array.isArray(series)) return [];
    return series.map((s) => {
      let rawPairs = [];
      
      // Extract pairs based on input format
      if (Array.isArray(s.pairs)) {
        rawPairs = s.pairs;
      } else if (Array.isArray(s.time) && Array.isArray(s.data)) {
        const n = Math.min(s.time.length, s.data.length);
        rawPairs = new Array(n);
        for (let i = 0; i < n; i++) rawPairs[i] = [s.time[i], s.data[i]];
      }
      
      // --- FIX: Normalize Time to MS Here ---
      const normalizedPairs = rawPairs.map(p => [toMs(p[0]), Number(p[1])]);

      return { 
        ...s, 
        // Sort by time (now in ms) and enforce monotonic
        pairs: enforceMonotonic(normalizedPairs.sort((a, b) => a[0] - b[0])) 
      };
    });
  }, [series]);

  // 2. Optional alignment (Memoized)
  const aligned = useMemo(() => {
    if (align !== "base-fastest" || pairsPerSeries.length === 0)
      return pairsPerSeries.map(s => ({ ...s, data: s.pairs }));

    const grid = pickFastestGrid(pairsPerSeries.map(s => s.pairs));
    if(!grid.length) return pairsPerSeries.map(s => ({ ...s, data: s.pairs }));

    return pairsPerSeries.map(s => ({
      ...s,
      data: sampleToGrid(s.pairs, grid, { method: alignMethod, tol: toleranceMs }),
    }));
  }, [pairsPerSeries, align, alignMethod, toleranceMs]);

  // 3. Final Series Ready for Chart
  const ready = useMemo(() => {
    return aligned; 
  }, [aligned]);

  // 4. Calculate Chart Options
  const options = useMemo(() => {
    if (!ready || ready.length === 0) return {};

    const allT = ready.flatMap(s => s.data.map(p => p[0])).filter(Number.isFinite);
    const minTs = allT.length ? Math.min(...allT) : undefined;
    const maxTs = allT.length ? Math.max(...allT) : undefined;
    const span  = (minTs != null && maxTs != null) ? (maxTs - minTs) : 0;

    const isSparse = Math.max(0, ...ready.map(s => s.data.length)) < MIN_POINTS_FOR_SCATTER;
    let xMin = null, xMax = null;
    if (isSparse && minTs != null && maxTs != null) {
      const pad = Math.max(5, Math.round(span * 0.05));
      xMin = minTs - pad; xMax = maxTs + pad;
    }

    const yAxis = ready.map((s, i) => {
      // 1. FIX ZOOM PROBLEM: Smart Scaling based on Unit
      // This prevents the chart from auto-zooming into 0.001 noise on straights.
      let min = undefined; // Auto
      let max = undefined; // Auto
      
      if (s.unit === 'G') {
          min = -2.5; max = 2.5; 
      } else if (s.unit === 'rad/s') {
          min = -10.0; max = 10.0;
      }

      return {
        type: "value",
        name: s.name,
        min: min, // Apply fixed scale
        max: max, // Apply fixed scale
        position: i === 0 ? "left" : "right",
        offset: i >= 2 ? (i - 1) * 60 : 0,
        axisLine: { show: true, lineStyle: { color: COLORS[i % COLORS.length] } },
        axisLabel: { formatter: `{value} ${s.unit || ""}` },
        splitLine: { show: i === 0 },
      };
    });

    const seriesOpts = ready.map((s, i) => ({
      name: s.name,
      yAxisIndex: i,
      type: "line",
      data: s.data,
      emphasis: { focus: "series" },
      lineStyle: { color: COLORS[i % COLORS.length], width: 2 },
      showSymbol: false,
      
      // 2. FIX SHAPE PROBLEM: Better Smoothing settings
      sampling: "average", // 'lttb' preserves spikes. 'average' smooths them out.
      connectNulls: true,
      smooth: 0.35,        // Increased from 0.2 for cleaner curves

      // --- ADDED MARKPOINT FOR MIN/MAX ---
      markPoint: {
        symbol: 'pin',
        symbolSize: 40,
        label: {
            show: true,
            fontSize: 10,
            formatter: '{c}'
        },
        itemStyle: {
            color: COLORS[i % COLORS.length]
        },
        data: [
          { type: 'max', name: 'Max' },
          { type: 'min', name: 'Min' }
        ]
      }
    }));

    // Data Zoom
    let dataZoom = [{ type: "inside", throttle: 50 }, { type: "slider", height: 20, bottom: 5 }];
    if (windowMs && windowMs > 0 && windowMs < span && minTs != null && maxTs != null) {
        const startValue = Math.max(minTs, maxTs - windowMs);
        dataZoom = [
            { type: "inside", throttle: 50, zoomOnMouseWheel: "shift", moveOnMouseMove: true, zoomLock: true },
            { type: "slider", height: 20, bottom: 5, startValue, endValue: startValue + windowMs, zoomLock: true }
        ];
    }

 return {
      color: COLORS,
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "cross" },
        valueFormatter: (value) => value !== null ? value.toFixed(3) : 'No Data',
        formatter: (params) => {
          if (!Array.isArray(params) || !params.length) return "";
          const ts = params[0]?.value?.[0];
          let out = `<b>${fmtMs(ts)}</b><br/>`;
          params.forEach((p) => {
            const unit = ready[p.seriesIndex]?.unit ?? "";
            const val = p.value && p.value[1] != null ? Number(p.value[1]).toFixed(3) : "--";
            out += `<span style="color:${p.color}">●</span> ${p.seriesName}: ${val} ${unit}<br/>`;
          });
          return out;
        },
      },
      grid: { 
          right: ready.length > 2 ? "15%" : "8%", 
          left: "8%", 
          top: 30, 
          bottom: 60 
      },
      xAxis: { 
          type: "time", 
          min: xMin,
          max: xMax,
          boundaryGap: false, 
          axisLabel: { hideOverlap: true, formatter: (v) => fmtMs(v) } 
      },
      yAxis,
      series: seriesOpts,
      dataZoom ,
      animation: false,
    };
  }, [ready, windowMs]);

  return <ReactECharts option={options} style={{ height: height, width: "100%" }} notMerge={true} lazyUpdate={true} />;
}

AutoPairChart.propTypes = {
  series: PropTypes.arrayOf(PropTypes.shape({
    name: PropTypes.string.isRequired,
    unit: PropTypes.string,
    time: PropTypes.array,
    data: PropTypes.array,
    pairs: PropTypes.array,
  })).isRequired,
  height: PropTypes.number,
  align: PropTypes.oneOf(["none", "base-fastest"]),
  alignMethod: PropTypes.oneOf(["linear", "nearest", "ffill"]),
  toleranceMs: PropTypes.number,
  windowMs: PropTypes.number,
};