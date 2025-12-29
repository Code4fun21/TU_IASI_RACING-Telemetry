import React, { useMemo } from 'react';
import ReactECharts from 'echarts-for-react'; 

const VitalChart = ({ dateTime, series, height = 300 }) => {

  // --- Helpers for Time Formatting ---
  const toMs = (t) => {
    if (t == null) return undefined;
    const n = Number(t);
    if (!Number.isFinite(n)) return undefined;
    // If timestamp is roughly small (seconds), multiply by 1000
    return n < 2e10 ? n * 1000 : n;
  };

  const fmtTime = (ms) => {
    if (!Number.isFinite(ms)) return "";
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

  const option = useMemo(() => {
    // Basic validation
    if (!dateTime || dateTime.length === 0) return {};

    // 1. Process Timestamps
    const formattedTime = dateTime.map(t => fmtTime(toMs(t)));

    const seriesList = series.map(s => ({
      name: s.name,
      type: 'line',
      showSymbol: false,
      data: s.data,
      smooth: true,
      lineStyle: { width: 2 }
    }));

    return {
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'cross' }
      },
      legend: {
        data: series.map(s => s.name),
        bottom: 0
      },
      grid: {
        left: '3%',
        right: '4%',
        bottom: '10%',
        containLabel: true
      },
      xAxis: {
        type: 'category',
        boundaryGap: false,
        data: formattedTime, // <--- Using formatted time strings
      },
      yAxis: {
        type: 'value',
        axisLabel: {
          formatter: `{value} ${series[0]?.unit || ''}` // Use first unit as default
        }
      },
      series: seriesList
    };
  }, [dateTime, series]);

  if (!dateTime || dateTime.length === 0) {
    return <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#999' }}>No Data</div>;
  }

  return (
    <ReactECharts
      option={option}
      style={{ height: height, width: '100%' }}
      notMerge={true} 
      lazyUpdate={true} 
    />
  );
};

export default VitalChart;