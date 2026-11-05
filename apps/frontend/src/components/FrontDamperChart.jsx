import PropTypes from "prop-types";
import { useEffect, useRef } from "react";
import * as echarts from "echarts";

const FrontDamperChart = ({ leftData, rightData, width = 200, height = 200 }) => {
    const chartRef = useRef(null);
    const chartInstanceRef = useRef(null);
    const lastLeftRef = useRef(0);
    const lastRightRef = useRef(0);

    const getChartOption = (lVal, rVal) => ({
        grid: {
            left: "3%",
            right: "4%",
            containLabel: true,
            top: "15%",
            height: 150,
            width: 120
        },
        xAxis: {
            type: "category",
            data: ["Left", "Right"],
            axisLabel: { color: "#fff" }
        },
        yAxis: {
            type: "value",
            min: 0,
            max: 15, // Adjusted to safely match your damper range
            axisLabel: { color: "#fff" }
        },
        series: [
            {
                data: [lVal, rVal],
                type: "bar",
                barWidth: 30,
                showBackground: true,
                backgroundStyle: {
                    color: "rgba(180, 180, 180, 0.2)",
                },
                itemStyle: {
                    color: "#58D9F9"
                }
            },
        ],
    });

    // Initialize ECharts instance on mount
    useEffect(() => {
        if (!chartRef.current) return;

        chartInstanceRef.current = echarts.init(chartRef.current);
        chartInstanceRef.current.setOption(getChartOption(0, 0));

        return () => {
            if (chartInstanceRef.current) {
                chartInstanceRef.current.dispose();
            }
        };
    }, []);

    // Update chart safely with holding references
    useEffect(() => {
        if (!chartInstanceRef.current) return;

        if (typeof leftData === "number" && !isNaN(leftData)) {
            lastLeftRef.current = leftData;
        }
        if (typeof rightData === "number" && !isNaN(rightData)) {
            lastRightRef.current = rightData;
        }

        chartInstanceRef.current.setOption({
            series: [
                {
                    data: [lastLeftRef.current, lastRightRef.current],
                },
            ],
        });
    }, [leftData, rightData]);

    return (
        <div style={{ width, height }}>
            <div ref={chartRef} style={{ width: "100%", height: "100%" }} />
        </div>
    );
};

FrontDamperChart.propTypes = {
    leftData: PropTypes.number.isRequired,
    rightData: PropTypes.number.isRequired,
    width: PropTypes.number,
    height: PropTypes.number,
};

export default FrontDamperChart;