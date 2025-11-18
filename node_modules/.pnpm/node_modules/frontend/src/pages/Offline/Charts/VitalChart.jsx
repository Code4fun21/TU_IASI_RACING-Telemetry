import PropTypes from "prop-types";
import { useEffect } from "react";
import * as echarts from "echarts";
import ChartWrapper from "../../../ChartWrapper";
import geoJson from "../../../../src/components/tracks_data/bacau.json"; // adjust the path to your geojson
import dateTime from "../../../components/dummyData/dateTime.json";
import rpm from "../../../components/dummyData/rpm.json";
import manifoldAirPressure from "../../../components/dummyData/manifoldAirPressure.json";
import manifoldAirTemperature from "../../../components/dummyData/manifoldAirTemperature.json";
import coolantTemperature from "../../../components/dummyData/coolantTemperature.json";
import throttlePosition from "../../../components/dummyData/throttlePosition.json";
import brakePressure from "../../../components/dummyData/brakePressure.json";

export default function VitalChart({ height = 500 }) {
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
        ],
    };

    return (
        <div style={{ height }}>
            <ChartWrapper options={options} style={{ width: "100%", height: "100%" }} height="550px" />
        </div>
    );
}

VitalChart.propTypes = {
    data: PropTypes.arrayOf(PropTypes.array).isRequired, // [[lon, lat, value]]
    width: PropTypes.number,
    height: PropTypes.number,
};
