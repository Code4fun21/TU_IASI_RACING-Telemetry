import React, { useMemo } from 'react';
import ReactECharts from 'echarts-for-react'; // Or your preferred wrapper, e.g. ChartWrapper

// Use your custom ChartWrapper if you prefer, but standard echarts-for-react is often safer for simple use cases
// If you want to use your ChartWrapper, swap the import and usage.
// Here I'll use a generic approach that fits most needs.

const VitalChart = ({ dateTime, series, height = 300 }) => {

  const option = useMemo(() => {
    // Basic validation
    if (!dateTime || dateTime.length === 0) return {};

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
        data: dateTime,
        axisLabel: { formatter: (val) => val } // Simplify if needed
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
      notMerge={true} // Important: prevents merging state which can cause issues with dynamic updates
      lazyUpdate={true} // Debounce updates for performance
    />
  );
};

export default VitalChart;