import React, { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import PropTypes from "prop-types";


const COLORS = ["#5470C6", "#91CC75", "#EE6666", "#73C0DE", "#FAC858"];
const MIN_POINTS_FOR_SCATTER = 20;
const EPS_X = 0.001;

// --- STATIC HELPERS ---
function enforceMonotonic(pairs) {
  let last = -Infinity;
  const out = [];
  for (const p of pairs) {
      let t = Number(p[0]);
      let v = Number(p[1]);
      if (!Number.isFinite(t)) continue;
      if (t <= last) t = last + EPS_X;
      last = t;
      out.push([t, v]);
  }
  return out;
}

const VitalChart_distance = ({ 
  distance = [], 
  series = [], 
  height = 500, 
  group = null,
  windowMs = null // Interpreted as distance window here
}) => {

  // 1. Prepare Data
  const norm = useMemo(() => {
    const dx = Array.isArray(distance) ? distance : [];
    
    return series.map((s) => {
      const d = Array.isArray(s.data) ? s.data : [];
      if (d.length === 0) return { ...s, data: [] };

      let pairs = [];

      // Check if data is already [[x,y], [x,y]]
      const isPairs = Array.isArray(d[0]) && d[0].length >= 2;

      if (isPairs) {
         pairs = d.map(p => [Number(p[0]), Number(p[1])]);
      } else {
         // Zip distance and values
         const n = Math.min(dx.length, d.length);
         for (let i = 0; i < n; i++) {
             pairs.push([Number(dx[i]), Number(d[i])]);
         }
      }

      // Sort by distance (X)
      pairs.sort((a, b) => a[0] - b[0]);
      
      return { 
          ...s, 
          data: enforceMonotonic(pairs) 
      };
    });
  }, [distance, series]);

  // 2. Calculate Chart Options
  const option = useMemo(() => {
    if (!norm || norm.length === 0 || norm[0].data.length === 0) return {};

    // Calculate X Range
    const allX = norm.flatMap(s => s.data.map(p => p[0]));
    let minX = Math.min(...allX);
    let maxX = Math.max(...allX);
    const span = maxX - minX;

    // Check sparsity
    const maxN = Math.max(...norm.map(s => s.data.length));
    const isSparse = maxN < MIN_POINTS_FOR_SCATTER;

    // Pad range if sparse
    if (isSparse) {
        const pad = Math.max(0.005, span * 0.05);
        minX -= pad;
        maxX += pad;
    }

    // Y Axes
    const yAxis = norm.map((s, i) => ({
        type: "value",
        name: s.name,
        position: i === 0 ? "left" : "right",
        offset: i >= 2 ? (i - 1) * 60 : 0,
        axisLine: { show: true, lineStyle: { color: COLORS[i % COLORS.length] } },
        axisLabel: { formatter: `{value} ${s.unit || ""}` },
        splitLine: { show: i === 0 }
    }));

    // Series
    const seriesOpts = norm.map((s, i) => ({
        name: s.name,
        yAxisIndex: i,
        type: isSparse ? "scatter" : "line",
        symbolSize: isSparse ? 8 : 4,
        showSymbol: isSparse,
        smooth: true,
        data: s.data,
        lineStyle: { width: 2, color: COLORS[i % COLORS.length] },
        itemStyle: { color: COLORS[i % COLORS.length] },
        sampling: "lttb",
    }));

    // Zoom
    let dataZoom = [{ type: "inside", throttle: 50 }, { type: "slider", height: 20, bottom: 5 }];
    
    if (windowMs && windowMs > 0 && windowMs < span) {
         const startVal = Math.max(minX, maxX - windowMs);
         dataZoom = [
            { type: "inside", throttle: 50, moveOnMouseMove: true, zoomLock: true },
            { type: "slider", height: 20, bottom: 5, startValue: startVal, endValue: startVal + windowMs, zoomLock: true }
         ];
    }

    return {
        color: COLORS,
        tooltip: {
            trigger: "axis",
            axisPointer: { type: "cross" },
            formatter: (params) => {
                if (!Array.isArray(params) || !params.length) return "";
                const xVal = params[0].value[0];
                let tip = `<b>Dist: ${Number(xVal).toFixed(3)} km</b><br/>`;
                params.forEach(p => {
                    const unit = norm[p.seriesIndex]?.unit || "";
                    const val = p.value[1] != null ? Number(p.value[1]).toFixed(2) : "--";
                    tip += `<span style="color:${p.color}">●</span> ${p.seriesName}: ${val} ${unit}<br/>`;
                });
                return tip;
            }
        },
        grid: { right: norm.length > 2 ? "15%" : "8%", left: "8%", top: 30, bottom: 60 },
        xAxis: {
            type: "value",
            name: "Distance (km)",
            min: minX,
            max: maxX,
            boundaryGap: false,
            scale: true
        },
        yAxis: yAxis,
        series: seriesOpts,
        dataZoom: dataZoom,
        animation: false
    };
  }, [norm, windowMs]);

  if (!norm || norm.length === 0) {
      return <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#999' }}>No Distance Data</div>;
  }

  return (
    <ReactECharts
      option={option}
      style={{ height, width: "100%" }}
      notMerge={true}
      lazyUpdate={true}
      group={group}
    />
  );
};

VitalChart_distance.propTypes = {
  distance: PropTypes.array,
  series: PropTypes.arrayOf(PropTypes.shape({
    name: PropTypes.string.isRequired,
    data: PropTypes.array.isRequired,
    unit: PropTypes.string
  })).isRequired,
  height: PropTypes.number,
  windowMs: PropTypes.number,
  group: PropTypes.string
};

export default VitalChart_distance;