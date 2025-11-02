// src/components/DistanceChart.jsx
import PropTypes from "prop-types";
import { useEffect, useMemo, useRef } from "react";
import * as echarts from "echarts";
import ChartWrapper from "../../../../ChartWrapper";

const COLORS = ["#5470C6", "#91CC75", "#EE6666", "#73C0DE", "#FAC858"];
const MIN_POINTS_FOR_SCATTER = 20;
const EPS_X = 0.001; // minimal bump (distance units) to keep X strictly increasing

export default function DistanceChart({
  distance = [],    // shared X in distance units
  series   = [],    // [{ name, data: number[] OR [x,val][], unit }]
  height   = 500,
  group    = null,
  windowMs = null,  // optional fixed window length (interpreted as distance units)
}) {
  const chartRef = useRef();

  useEffect(() => {
    if (group) echarts.connect(group);
  }, [group]);

  // ---- helper: enforce strictly increasing x per series ----
  const enforceMonotonic = (pairs) => {
    let last = -Infinity;
    return pairs.map(([x, v]) => {
      let t = Number(x);
      if (!Number.isFinite(t)) return null;
      if (t <= last) t = last + EPS_X;
      last = t;
      return [t, Number(v)];
    }).filter(Boolean);
  };

  // ---------- Normalize to [x, value] pairs; support y-only ----------
  const norm = useMemo(() => {
    const dx = Array.isArray(distance) ? distance : [];
    return series.map((s) => {
      const d = Array.isArray(s.data) ? s.data : [];

      const looksLikePairs =
        Array.isArray(d[0]) && d[0].length >= 2 && Number.isFinite(Number(d[0][0]));

      let pairs;
      if (looksLikePairs) {
        pairs = d
          .map(([x, v]) => [Number(x), Number(v)])
          .filter(([x, v]) => Number.isFinite(x) && Number.isFinite(v))
          .sort((a, b) => a[0] - b[0]);
      } else {
        const n = Math.min(dx.length, d.length);
        pairs = [];
        for (let i = 0; i < n; i++) {
          const x = Number(dx[i]);
          const v = Number(d[i]);
          if (Number.isFinite(x) && Number.isFinite(v)) pairs.push([x, v]);
        }
        pairs.sort((a, b) => a[0] - b[0]);
      }

      return { ...s, data: enforceMonotonic(pairs) };
    });
  }, [distance, series]);

  // y-axes (one per series)
  const yAxis = norm.map((s, i) => ({
    type: "value",
    name: s.name,
    position: i === 0 ? "left" : "right",
    offset: i >= 2 ? (i - 1) * 65 : 0,
    axisLine: { lineStyle: { color: COLORS[i % COLORS.length] } },
    axisLabel: { formatter: `{value} ${s.unit || ""}` },
  }));

  // global X span
  const { minX, maxX, span, maxN, isSparse } = useMemo(() => {
    const allX = norm.flatMap(s => s.data.map(p => p[0])).filter(Number.isFinite);
    const minX = allX.length ? Math.min(...allX) : undefined;
    const maxX = allX.length ? Math.max(...allX) : undefined;
    const span = minX != null && maxX != null ? (maxX - minX) : 0;
    const maxN = Math.max(0, ...norm.map(s => s.data.length));
    return { minX, maxX, span, maxN, isSparse: maxN > 0 && maxN < MIN_POINTS_FOR_SCATTER };
  }, [norm]);

  // pad when sparse to avoid cramped x range
  let xMin, xMax;
  if (isSparse && minX != null && maxX != null) {
    const pad = Math.max(5e-3, span * 0.05); // a small pad in distance units
    xMin = minX - pad; xMax = maxX + pad;
  }

  // series (scatter when sparse, line otherwise)
  const seriesOpts = norm.map((s, i) => {
    const color = COLORS[i % COLORS.length];
    const base = {
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

  // dataZoom (bottom slider); supports fixed-window scrolling if windowMs set
  const sliderZoom = useMemo(() => {
    if (minX == null || maxX == null) {
      return [
        { type: "inside", throttle: 50 },
        { type: "slider", height: 18, bottom: 8 },
      ];
    }

    if (!windowMs || windowMs <= 0 || windowMs >= span) {
      // free zoom
      return [
        { type: "inside", throttle: 50 },
        { type: "slider", height: 18, bottom: 8, filterMode: "none" },
      ];
    }

    const startValue = Math.max(minX, maxX - windowMs);
    const endValue   = startValue + windowMs;

    return [
      {
        type: "inside",
        throttle: 50,
        zoomOnMouseWheel: "shift",
        moveOnMouseMove: true,
        moveOnMouseWheel: true,
        zoomLock: true,            // fixed window length
        xAxisIndex: [0],
      },
      {
        type: "slider",
        height: 18,
        bottom: 8,
        filterMode: "none",
        startValue,
        endValue,
        zoomLock: true,
        brushSelect: false,
        handleSize: 12,
      },
    ];
  }, [minX, maxX, span, windowMs]);

  const options = {
    color: COLORS,
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "cross" },
      formatter: (params) => {
        if (!params?.length) return "";
        const x = params[0]?.value?.[0];
        let out = `<b>Distance: ${Number(x).toFixed(3)}</b><br/>`;
        params.forEach((p) => {
          const unit = norm[p.seriesIndex]?.unit ?? "";
          out += `<span style="color:${p.color}">●</span> ${p.seriesName}: ${p.value[1]} ${unit}<br/>`;
        });
        return out;
      },
    },
    // Toolbox: keep ONLY Restore + Save (remove the first two buttons)
    toolbox: {
      right: 10,
      feature: {
        restore: {},
        saveAsImage: {},
      },
    },
    grid: { right: "22%", left: "10%", top: 30, bottom: 55 },
    xAxis: {
      type: "value",
      name: "Distance",
      min: xMin, max: xMax,
      boundaryGap: false,
      axisLabel: { hideOverlap: true, formatter: (val) => Number(val).toFixed(2) },
      axisPointer: { label: { formatter: ({ value }) => Number(value).toFixed(3) } },
      scale: true,
    },
    yAxis,
    series: seriesOpts,
    dataZoom: sliderZoom,
  };

  return (
    <div ref={chartRef} style={{ height }}>
      <ChartWrapper options={options} group={group} style={{ width: "100%", height: "100%" }} />
    </div>
  );
}

DistanceChart.propTypes = {
  distance: PropTypes.arrayOf(PropTypes.number),
  series: PropTypes.arrayOf(
    PropTypes.shape({
      name: PropTypes.string.isRequired,
      unit: PropTypes.string,
      data: PropTypes.array.isRequired, // number[] or [x,val][]
    })
  ).isRequired,
  height: PropTypes.number,
  group: PropTypes.string,
  // same prop name as VitalChart; here it means "distance window"
  windowMs: PropTypes.number,
};
