import PropTypes from "prop-types";
import { useRef, useEffect } from "react";
import * as echarts from "echarts";

const BrakePressureChart = ({ data, width = 250, height = 100 }) => {
  const chartRef = useRef(null);
  const chartInstanceRef = useRef(null);
  const lastValueRef = useRef(0);

  // Clamp valid value
  const clamp = (val, min, max) => Math.max(min, Math.min(max, val));

  // Initial chart setup
  useEffect(() => {
    if (!chartRef.current) return;

    chartInstanceRef.current = echarts.init(chartRef.current);
    chartInstanceRef.current.setOption(getOption(0));

    return () => {
      chartInstanceRef.current.dispose();
    };
  }, []);

  // Update chart only when value is valid
  useEffect(() => {
    if (!chartInstanceRef.current) return;

    if (typeof data === "number" && !isNaN(data)) {
      lastValueRef.current = clamp(data, 0, 70);
    }

    chartInstanceRef.current.setOption({
      series: [
        {
          data: [lastValueRef.current],
        },
      ],
    });
  }, [data]);

  // Chart option builder
  const getOption = (value) => ({
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "shadow" },
    },
    grid: {
      left: "3%",
      right: "4%",
      containLabel: true,
      top: "20%",
      bottom: "20%",
      height: 40,
    },
    xAxis: {
      type: "value",
      min: 0,
      max: 70,
      splitLine: { show: false },
    },
    yAxis: {
      type: "category",
      data: [""],
      axisTick: { show: false },
      axisLine: { show: false },
    },
    series: [
      {
        type: "bar",
        data: [value],
        barWidth: 40,
        itemStyle: {
          color: "#FF4C4C",
        },
        label: {
          show: true,
          position: "insideRight",
          formatter: "{c} bar",
          fontWeight: "bold",
          color: "#fff",
        },
        // Enable smooth animation
        animation: true,
        animationDuration: 300,
        animationEasing: "cubicOut",
      },
    ],
  });

  return (
    <div style={{ width, height }}>
      <div ref={chartRef} style={{ width: "100%", height: "100%" }} />
    </div>
  );
};

BrakePressureChart.propTypes = {
  data: PropTypes.number.isRequired,
  width: PropTypes.number,
  height: PropTypes.number,
};

export default BrakePressureChart;
