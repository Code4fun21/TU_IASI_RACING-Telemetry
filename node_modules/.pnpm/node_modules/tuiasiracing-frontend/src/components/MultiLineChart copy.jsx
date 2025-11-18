import PropTypes from "prop-types";
import { useEffect } from "react";
import * as echarts from "echarts";
import ChartWrapper from "../ChartWrapper";
import geoJson from "./bacau.json"; // adjust the path to your geojson
import dateTime from "./dummyData/dateTime.json";
import rpm from "./dummyData/rpm.json";
import manifoldAirPressure from "./dummyData/manifoldAirPressure.json";
import manifoldAirTemperature from "./dummyData/manifoldAirTemperature.json";
import coolantTemperature from "./dummyData/coolantTemperature.json";
import throttlePosition from "./dummyData/throttlePosition.json";
import brakePressure from "./dummyData/brakePressure.json";

const MultiLineChart = ({ height = 500 }) => {
    useEffect(() => {
        echarts.registerMap("SpeedParkBacau", geoJson);
    }, []);
    const colors = ["#5470C6", "#91CC75", "#EE6666", "#73C0DE", "#3BA272", "#FC8452"];
    const options = {
        color: colors,
        tooltip: {
            trigger: "axis",
            axisPointer: {
                type: "cross",
            },
        },
        grid: {
            right: "20%",
        },
        toolbox: {
            feature: {
                dataView: { show: true, readOnly: false },
                restore: { show: true },
                saveAsImage: { show: true },
            },
        },
        legend: {
            data: ["Evaporation", "Precipitation", "Temperature"],
        },
        xAxis: [
            {
                type: "category",
                axisTick: {
                    alignWithLabel: true,
                },
                // prettier-ignore
                data: dateTime.data,
            },
        ],
        yAxis: [
            {
                type: "value",
                name: "RPM",
                position: "right",
                alignTicks: true,
                axisLine: {
                    show: true,
                    lineStyle: {
                        color: colors[0],
                    },
                },
                axisLabel: {
                    formatter: "{value} rpm",
                },
            },
            {
                type: "value",
                name: "MAP",
                position: "right",
                alignTicks: true,
                offset: 80,
                axisLine: {
                    show: true,
                    lineStyle: {
                        color: colors[1],
                    },
                },
                axisLabel: {
                    formatter: "{value} kPa",
                },
            },
            {
                type: "value",
                name: "Temperature",
                position: "left",
                alignTicks: true,
                axisLine: {
                    show: true,
                    lineStyle: {
                        color: colors[3],
                    },
                },
                axisLabel: {
                    formatter: "{value} °C",
                },
            },
            {
                type: "value",
                name: "Percentage",
                position: "left",
                alignTicks: true,
                offset: 70,
                axisLine: {
                    show: true,
                    lineStyle: {
                        color: colors[4],
                    },
                },
                axisLabel: {
                    formatter: "{value} %",
                },
            },
            {
                type: "value",
                name: "mV",
                position: "right",
                alignTicks: true,
                offset: 150,
                axisLine: {
                    show: true,
                    lineStyle: {
                        color: colors[4],
                    },
                },
                axisLabel: {
                    formatter: "{value} mV",
                },
            },

        ],
        series: [
            {
                name: "RPM",
                type: "line",
                data: rpm.data,
            },
            {
                name: "MAP",
                type: "line",
                yAxisIndex: 1,
                data: manifoldAirPressure.data,
            },
            {
                name: "Manifold Air Temp",
                type: "line",
                yAxisIndex: 2,
                data: manifoldAirTemperature.data,
            },
            {
                name: "Coolant Temp",
                type: "line",
                yAxisIndex: 2,
                data: coolantTemperature.data,
            },
            {
                name: "Throttle Position",
                type: "line",
                yAxisIndex: 3,
                data: throttlePosition.data,
            },
            {
                name: "Brake Pressure",
                type: "line",
                yAxisIndex: 4,
                data: brakePressure.data,
            },

        ],
    };

    return (
        <div style={{ height }}>
            <ChartWrapper options={options} style={{ width: "100%", height: "100%" }} height="550px" />
        </div>
    );
};

MultiLineChart.propTypes = {
    data: PropTypes.arrayOf(PropTypes.array).isRequired, // [[lon, lat, value]]
    width: PropTypes.number,
    height: PropTypes.number,
};

export default MultiLineChart;
