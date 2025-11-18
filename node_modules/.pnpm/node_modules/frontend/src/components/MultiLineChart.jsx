import PropTypes from "prop-types";
import { useEffect, useRef, memo } from "react";
import * as echarts from "echarts";

// Efficient chart wrapper component
const ChartWrapper = memo(({ options, group, height = "300px" }) => {
    const chartRef = useRef(null);

    useEffect(() => {
        if (!chartRef.current) return;

        let chartInstance = echarts.getInstanceByDom(chartRef.current);
        if (!chartInstance) {
            chartInstance = echarts.init(chartRef.current, "shine");
        }

        if (group) {
            chartInstance.group = group;
        }

        chartInstance.setOption(options);

        const handleResize = () => chartInstance.resize();
        window.addEventListener("resize", handleResize);

        return () => {
            window.removeEventListener("resize", handleResize);
        };
    }, [options, group]);

    return <div ref={chartRef} style={{ height: height, width: "100%" }} />;
});

ChartWrapper.displayName = "ChartWrapper";
ChartWrapper.propTypes = {
    options: PropTypes.object.isRequired,
    group: PropTypes.string,
    height: PropTypes.string,
};

const MultiLineChart = ({ data, height = 500 }) => {
    const colors = [
        "#5470C6", "#91CC75", "#EE6666", "#73C0DE",
        "#3BA272", "#FC8452", "#9A60B4", "#EA7CCC",
        "#FFA07A", "#20B2AA", "#778899", "#FF69B4",
    ];

    // Auto-generate series from data keys except 'timestamps'
    const dataKeys = Object.keys(data).filter((key) => key !== "timestamps");

    const series = dataKeys.map((key, index) => ({
        name: key,
        type: "line",
        showSymbol: false,
        smooth: true,
        yAxisIndex: 0,
        data: data[key],
    }));

    const options = {
        color: colors,
        tooltip: {
            trigger: "axis",
            axisPointer: { type: "cross" },
        },
        legend: {
            data: dataKeys,
            type: "scroll",
            bottom: 0,
        },
        grid: {
            left: "3%",
            right: "4%",
            bottom: "10%",
            containLabel: true,
        },
        xAxis: {
            type: "category",
            boundaryGap: false,
            data: data.timestamps,
        },
        yAxis: {
            type: "value",
            axisLine: {
                lineStyle: { color: "#ccc" },
            },
            splitLine: {
                lineStyle: { type: "dashed", color: "#eee" },
            },
        },
        series,
    };

    return (
        <div style={{ height }}>
            <ChartWrapper options={options} height={`${height}px`} />
        </div>
    );
};

MultiLineChart.propTypes = {
    data: PropTypes.shape({
        timestamps: PropTypes.array.isRequired,
    }).isRequired,
    height: PropTypes.number,
};

export default memo(MultiLineChart);
