import React from "react";
import PropTypes from "prop-types";
import ChartWrapper from "../ChartWrapper"; // Adjust path if needed

const carBase64 =
    "data:image/svg+xml;base64,PHN2ZyBpZD0iaWNvbnMiIGVuYWJsZS1iYWNrZ3JvdW5kPSJuZXcgMCAwIDY0IDY0IiBoZWlnaHQ9IjY0IiB2aWV3Qm94PSIwIDAgNjQgNjQiIHdpZHRoPSI2NCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48Zz48Zz48cGF0aCBkPSJtMzYgMjR2M2MwLTIuMjEtMS43OS00LTQtNHMtNCAxLjc5LTQgNHYtMy00LTJjMCAxLjEuOSAyIDIgMmg0YzEuMSAwIDItLjkgMi0ydjJ6IiBmaWxsPSIjZGE0NDUzIi8+PC9nPjxnPjxwYXRoIGQ9Im0zNiAxOGMwIDEuMS0uOSAyLTIgMmgtNGMtMS4xIDAtMi0uOS0yLTIgMC0uNTUuMjItMS4wNS41OS0xLjQxLjM2LS4zNy44Ni0uNTkgMS40MS0uNTloNGMxLjEgMCAyIC45IDIgMnoiIGZpbGw9IiM2NTZkNzgiLz48L2c+PGc+PHBhdGggZD0ibTMyIDIzYzIuMjEgMCA0IDEuNzkgNCA0aC04YzAtMi4yMSAxLjc5LTQgNC00eiIgZmlsbD0iI2VkNTU2NSIvPjwvZz48Zz48cGF0aCBkPSJtNDQgMjB2NGgtMi02di00eiIgZmlsbD0iI2U2ZTllZCIvPjwvZz48Zz48cGF0aCBkPSJtMzYgMjRoNnYzaC02eiIgZmlsbD0iIzY1NmQ3OCIvPjwvZz48Zz48cGF0aCBkPSJtMjggMjB2NGgtNi0ydi00eiIgZmlsbD0iI2U2ZTllZCIvPjwvZz48Zz48cGF0aCBkPSJtMjIgMjRoNnYzaC02eiIgZmlsbD0iIzY1NmQ3OCIvPjwvZz48Zz48cGF0aCBkPSJtMTQgMzVoM3Y2aC0zeiIgZmlsbD0iIzY1NmQ3OCIvPjwvZz48Zz48cGF0aCBkPSJtMTQgMzBoM3Y1aC0zeiIgZmlsbD0iIzY1NmQ3OCIvPjwvZz48Zz48cGF0aCBkPSJtMjAgMzJoNHYzaC00eiIgZmlsbD0iIzY1NmQ3OCIvPjwvZz48Zz48cGF0aCBkPSJtMTcgMzV2LTUtM2g1IDZsLS43MyA4aC0zLjI3di0zaC00djN6IiBmaWxsPSIjZDMzNzRlIi8+PC9nPjxnPjxwYXRoIGQ9Im0yMCAzNWg0IDMuMjdsLS4yNyAzdjNoLTEwdi02eiIgZmlsbD0iI2QzMzc0ZSIvPjwvZz48Zz48cGF0aCBkPSJtMjcgMzhoMTB2M2gtMTB6IiBmaWxsPSIjZWQ1NTY1Ii8+PC9nPjxnPjxwYXRoIGQ9Im0zNi43MyAzNSAuMjcgM2gtMTBsLjI3LTMgLjczLThoOHoiIGZpbGw9IiNkYTQ0NTMiLz48L2c+PGc+PHBhdGggZD0ibTQ3IDMwdjVoLTN2LTNoLTR2M2gtMy4yN2wtLjczLThoNiA1eiIgZmlsbD0iI2QzMzc0ZSIvPjwvZz48Zz48cGF0aCBkPSJtNDAgMzJoNHYzaC00eiIgZmlsbD0iIzY1NmQ3OCIvPjwvZz48Zz48cGF0aCBkPSJtNDcgMzBoM3Y1aC0zeiIgZmlsbD0iIzY1NmQ3OCIvPjwvZz48Zz48cGF0aCBkPSJtNDcgMzVoM3Y2aC0zeiIgZmlsbD0iIzY1NmQ3OCIvPjwvZz48Zz48cGF0aCBkPSJtMzYuNzMgMzVoMy4yNyA0IDN2NmgtMTB2LTN6IiBmaWxsPSIjZDMzNzRlIi8+PC9nPjxnPjxwYXRoIGQ9Im01NCA0NWgzdi00aC0zdi02LTNjMC0xLjEuOS0yIDItMmg1YzEuMSAwIDIgLjkgMiAydjE0YzAgMS4xLS45IDItMiAyaC01Yy0xLjEgMC0yLS45LTItMnoiIGZpbGw9IiM2NTZkNzgiLz48L2c+PGc+PHBhdGggZD0ibTU3IDQxdjRoLTMtNDQtM3YtNGgzIDQgMyAxMCAxMCAxMCAzIDR6IiBmaWxsPSIjZTZlOWVkIi8+PC9nPjxnPjxwYXRoIGQ9Im03IDQ1aDN2MWMwIDEuMS0uOSAyLTIgMmgtNWMtMS4xIDAtMi0uOS0yLTJ2LTE0YzAtMS4xLjktMiAyLTJoNWMxLjEgMCAyIC45IDIgMnYzIDZoLTN6IiBmaWxsPSIjNjU2ZDc4Ii8+PC9nPjwvZz48Zz48Zz48cGF0aCBkPSJtOCA0OWgtNWMtMS42NTQgMC0zLTEuMzQ2LTMtM3YtMTRjMC0xLjY1NCAxLjM0Ni0zIDMtM2g1YzEuNjU0IDAgMyAxLjM0NiAzIDN2OWMwIC41NTMtLjQ0NyAxLTEgMXMtMS0uNDQ3LTEtMXYtOWMwLS41NTItLjQ0OC0xLTEtMWgtNWMtLjU1MiAwLTEgLjQ0OC0xIDF2MTRjMCAuNTUyLjQ0OCAxIDEgMWg1Yy41NTIgMCAxLS40NDggMS0xdi0xLjAwNGMwLS41NTMuNDQ3LTEgMS0xczEgLjQ0NyAxIDF2MS4wMDRjMCAxLjY1NC0xLjM0NiAzLTMgM3oiLz48L2c+PGc+PHBhdGggZD0ibTYxIDQ5aC01Yy0xLjY1NCAwLTMtMS4zNDYtMy0zdi0xLjAwNGMwLS41NTMuNDQ3LTEgMS0xczEgLjQ0NyAxIDF2MS4wMDRjMCAuNTUyLjQ0OCAxIDEgMWg1Yy41NTIgMCAxLS40NDggMS0xdi0xNGMwLS41NTItLjQ0OC0xLTEtMWgtNWMtLjU1MiAwLTEgLjQ0OC0xIDF2OC45OTZjMCAuNTUzLS40NDcgMS0xIDFzLTEtLjQ0Ny0xLTF2LTguOTk2YzAtMS42NTQgMS4zNDYtMyAzLTNoNWMxLjY1NCAwIDMgMS4zNDYgMyAzdjE0YzAgMS42NTQtMS4zNDYgMy0zIDN6Ii8+PC9nPjxnPjxwYXRoIGQ9Im01NyA0NS45OTZoLTUwYy0uNTUzIDAtMS0uNDQ3LTEtMXYtNGMwLS41NTMuNDQ3LTEgMS0xaDUwYy41NTMgMCAxIC40NDcgMSAxdjRjMCAuNTUzLS40NDcgMS0xIDF6bS00OS0yaDQ4di0yaC00OHoiLz48L2c+PGc+PGc+PHBhdGggZD0ibTM3LjAwMyA0MS45OTZjLS41NTMgMC0xLS40NDctMS0xdi0yLjk5NmMwLS41NTMuNDQ3LTEgMS0xczEgLjQ0NyAxIDF2Mi45OTZjMCAuNTUzLS40NDcgMS0xIDF6Ii8+PC9nPjxnPjxwYXRoIGQ9Im0yNi45OTcgNDEuOTk2Yy0uNTUzIDAtMS0uNDQ3LTEtMXYtMi45OTZjMC0uNTUzLjQ0Ny0xIDEtMXMxIC40NDcgMSAxdjIuOTk2YzAgLjU1My0uNDQ3IDEtMSAxeiIvPjwvZz48L2c+PGc+PHBhdGggZD0ibTM3IDM5aC0xMGMtLjI4MSAwLS41NDktLjExOC0uNzM4LS4zMjYtLjE4OS0uMjA3LS4yODMtLjQ4NC0uMjU4LS43NjVsMS4wMDEtMTEuMDAyYy4wNDctLjUxNS40NzktLjkwOS45OTYtLjkwOWg3Ljk5OGMuNTE4IDAgLjk0OS4zOTUuOTk2LjkwOWwxLjAwMSAxMS4wMDJjLjAyNS4yOC0uMDY4LjU1OC0uMjU4Ljc2NS0uMTg5LjIwOC0uNDU3LjMyNi0uNzM4LjMyNnptLTguOTA1LTJoNy44MTFsLS44MTktOS4wMDJoLTYuMTcyeiIvPjwvZz48Zz48cGF0aCBkPSJtMjcuMjczIDM2aC0xNy4yNzNjLS41NTMgMC0xLS40NDctMS0xcy40NDctMSAxLTFoMTcuMjczYy41NTMgMCAxIC40NDcgMSAxcy0uNDQ3IDEtMSAxeiIvPjwvZz48Zz48cGF0aCBkPSJtNTQgMzZoLTE3LjI3M2MtLjU1MyAwLTEtLjQ0Ny0xLTFzLjQ0Ny0xIDEtMWgxNy4yNzNjLjU1MyAwIDEgLjQ0NyAxIDFzLS40NDcgMS0xIDF6Ii8+PC9nPjxnPjxwYXRoIGQ9Im0xNy4wMDIgNDEuOTk2Yy0uNTUzIDAtMS0uNDQ3LTEtMXYtMTMuOTk0YzAtLjU1My40NDctMSAxLTFzMSAuNDQ3IDEgMXYxMy45OTRjMCAuNTUzLS40NDcgMS0xIDF6Ii8+PC9nPjxnPjxwYXRoIGQ9Im0xNC4wMDEgNDEuOTk2Yy0uNTUzIDAtMS0uNDQ3LTEtMXYtMTAuOTkyYzAtLjU1My40NDctMSAxLTFzMSAuNDQ3IDEgMXYxMC45OTJjMCAuNTUzLS40NDcgMS0xIDF6Ii8+PC9nPjxnPjxwYXRoIGQ9Im0xNy4wMDIgMzEuMDA0aC0zLjAwMWMtLjU1MyAwLTEtLjQ0Ny0xLTFzLjQ0Ny0xIDEtMWgzLjAwMWMuNTUzIDAgMSAuNDQ3IDEgMXMtLjQ0NyAxLTEgMXoiLz48L2c+PGc+PHBhdGggZD0ibTI4LjAwMSAyOC4wMDJoLTEwLjk5OWMtLjU1MyAwLTEtLjQ0Ny0xLTFzLjQ0Ny0xIDEtMWgxMC45OTljLjU1MyAwIDEgLjQ0NyAxIDFzLS40NDcgMS0xIDF6Ii8+PC9nPjxnPjxwYXRoIGQ9Im00NyA0MS45OTZjLS41NTMgMC0xLS40NDctMS0xdi0xMy45OTRjMC0uNTUzLjQ0Ny0xIDEtMXMxIC40NDcgMSAxdjEzLjk5NGMwIC41NTMtLjQ0NyAxLTEgMXoiLz48L2c+PGc+PHBhdGggZD0ibTUwLjAwMSA0MS45OTZjLS41NTMgMC0xLS40NDctMS0xdi0xMC45OTJjMC0uNTUzLjQ0Ny0xIDEtMXMxIC40NDcgMSAxdjEwLjk5MmMwIC41NTMtLjQ0NyAxLTEgMXoiLz48L2c+PGc+PHBhdGggZD0ibTUwLjAwMSAzMS4wMDRoLTMuMDAxYy0uNTUzIDAtMS0uNDQ3LTEtMXMuNDQ3LTEgMS0xaDMuMDAxYy41NTMgMCAxIC40NDcgMSAxcy0uNDQ3IDEtMSAxeiIvPjwvZz48Zz48cGF0aCBkPSJtNDcgMjguMDAyaC0xMC45OTljLS41NTMgMC0xLS40NDctMS0xcy40NDctMSAxLTFoMTAuOTk5Yy41NTMgMCAxIC40NDcgMSAxcy0uNDQ3IDEtMSAxeiIvPjwvZz48Zz48cGF0aCBkPSJtMjguMDAxIDI3Ljk5OGMtLjU1MyAwLTEtLjQ0Ny0xLTF2LTguOTk4YzAtLjU1My40NDctMSAxLTFzMSAuNDQ3IDEgMXY4Ljk5OGMwIC41NTMtLjQ0NyAxLTEgMXoiLz48L2c+PGc+PHBhdGggZD0ibTM1Ljk5OSAyNy45OThjLS41NTMgMC0xLS40NDctMS0xdi04Ljk5OGMwLS41NTMuNDQ3LTEgMS0xczEgLjQ0NyAxIDF2OC45OThjMCAuNTUzLS40NDcgMS0xIDF6Ii8+PC9nPjxnPjxwYXRoIGQ9Im0zMy45OTkgMjFoLTMuOTk4Yy0xLjY1NCAwLTMtMS4zNDYtMy0zczEuMzQ2LTMgMy0zaDMuOTk4YzEuNjU0IDAgMyAxLjM0NiAzIDNzLTEuMzQ2IDMtMyAzem0tMy45OTgtNGMtLjU1MiAwLTEgLjQ0OC0xIDFzLjQ0OCAxIDEgMWgzLjk5OGMuNTUyIDAgMS0uNDQ4IDEtMXMtLjQ0OC0xLTEtMXoiLz48L2c+PGc+PHBhdGggZD0ibTI0IDM2aC00Yy0uNTUzIDAtMS0uNDQ3LTEtMXYtM2MwLS41NTMuNDQ3LTEgMS0xaDRjLjU1MyAwIDEgLjQ0NyAxIDF2M2MwIC41NTMtLjQ0NyAxLTEgMXptLTMtMmgydi0xaC0yeiIvPjwvZz48Zz48cGF0aCBkPSJtNDQuMDAxIDM2aC00Yy0uNTUzIDAtMS0uNDQ3LTEtMXYtM2MwLS41NTMuNDQ3LTEgMS0xaDRjLjU1MyAwIDEgLjQ0NyAxIDF2M2MwIC41NTMtLjQ0NyAxLTEgMXptLTMtMmgydi0xaC0yeiIvPjwvZz48Zz48cGF0aCBkPSJtMjIgMjguMDAyYy0uNTUzIDAtMS0uNDQ3LTEtMXYtMy4wMDJjMC0uNTUzLjQ0Ny0xIDEtMXMxIC40NDcgMSAxdjMuMDAyYzAgLjU1My0uNDQ3IDEtMSAxeiIvPjwvZz48Zz48cGF0aCBkPSJtMjguMDAxIDI1aC02LjAwMWMtLjU1MyAwLTEtLjQ0Ny0xLTFzLjQ0Ny0xIDEtMWg2LjAwMWMuNTUzIDAgMSAuNDQ3IDEgMXMtLjQ0NyAxLTEgMXoiLz48L2c+PGc+PHBhdGggZD0ibTQyIDI4LjAwMmMtLjU1MyAwLTEtLjQ0Ny0xLTF2LTMuMDAyYzAtLjU1My40NDctMSAxLTFzMSAuNDQ3IDEgMXYzLjAwMmMwIC41NTMtLjQ0NyAxLTEgMXoiLz48L2c+PGc+PHBhdGggZD0ibTQyIDI1aC02LjAwMWMtLjU1MyAwLTEtLjQ0Ny0xLTFzLjQ0Ny0xIDEtMWg2LjAwMWMuNTUzIDAgMSAuNDQ3IDEgMXMtLjQ0NyAxLTEgMXoiLz48L2c+PGc+PHBhdGggZD0ibTI4IDI1aC04Yy0uNTUzIDAtMS0uNDQ3LTEtMXYtNGMwLS41NTMuNDQ3LTEgMS0xaDhjLjU1MyAwIDEgLjQ0NyAxIDF2NGMwIC41NTMtLjQ0NyAxLTEgMXptLTctMmg2di0yaC02eiIvPjwvZz48Zz48cGF0aCBkPSJtNDQgMjVoLThjLS41NTMgMC0xLS40NDctMS0xdi00YzAtLjU1My40NDctMSAxLTFoOGMuNTUzIDAgMSAuNDQ3IDEgMXY0YzAgLjU1My0uNDQ3IDEtMSAxem0tNy0yaDZ2LTJoLTZ6Ii8+PC9nPjxnPjxwYXRoIGQ9Im0zNi4wMDEgMjhjLS41NTMgMC0xLS40NDctMS0xIDAtMS42NTQtMS4zNDYtMy0zLTNzLTMgMS4zNDYtMyAzYzAgLjU1My0uNDQ3IDEtMSAxcy0xLS40NDctMS0xYzAtMi43NTcgMi4yNDMtNSA1LTVzNSAyLjI0MyA1IDVjMCAuNTUzLS40NDcgMS0xIDF6Ii8+PC9nPjwvZz48L3N2Zz4=";

const RollChart = ({ value, width = 200, height = 200, label = "Roll" }) => {
    const options = {
        series: [
            {
                type: "gauge",
                startAngle: 0,
                endAngle: 360,
                min: 0,
                max: 360,
                splitNumber: 8,
                axisLine: {
                    lineStyle: {
                        width: 10,
                        color: [[1, "#eee"]],
                    },
                },
                axisTick: {
                    length: 5,
                    distance: 10,
                    lineStyle: { color: "#999", width: 1 },
                },
                splitLine: {
                    length: 10,
                    distance: 10,
                    lineStyle: { color: "#999", width: 1 },
                },
                axisLabel: {
                    distance: 15,
                    fontSize: 10,
                    color: "#555",
                    formatter: (angle) => {
                        // Map 0 and 180 to 0°
                        // 90 → -90°, 270 → +90°
                        if (angle === 0 || angle === 180) return "0°";
                        if (angle === 90) return "-90°";
                        if (angle === 270) return "+90°";
                        if (angle === 45) return "-45°";
                        if (angle === 135) return "-45";
                        if (angle === 225) return "+45";
                        if (angle === 315) return "+45°";
                        return "";
                    },
                },
                pointer: { show: false },
                detail: {
                    formatter: `${value}°`,
                    fontSize: 14,
                    color: "#444",
                    offsetCenter: [0, "50%"],
                },
                title: {
                    show: true,
                    offsetCenter: [0, "-40%"],
                    fontSize: 12,
                    color: "#888",
                },
                data: [
                    {
                        // Convert roll from -90 → 90 to 360 scale
                        value: 180 - value,
                        name: label,
                    },
                ],
            },
        ],
        graphic: [
            {
                type: "image",
                left: "center",
                top: "center",
                rotation: (value * Math.PI) / 180,
                origin: [30, 30],
                style: {
                    image: carBase64,
                    width: 80,
                    height: 80,
                },
            },
            {
                  type: "line",
                  left: "center",
                  top: "center",
                  rotation: ((value - 90) * Math.PI) / 180, // adjust to match gauge layout
                  shape: {
                      x1: 0,
                      y1: 0, // Start closer to the outer edge
                      x2: 0,
                      y2: -200, // End further out at the outer radius
                  },
                  style: {
                      stroke: "#e53935",
                      lineWidth: 2,
                  },
                  origin: [30, 30], // Center of the chart
              },
        ],
    };

    return (
        <div style={{ width, height }}>
            <ChartWrapper options={options} />
        </div>
    );
};

RollChart.propTypes = {
    value: PropTypes.number.isRequired,
    label: PropTypes.string,
    width: PropTypes.number,
    height: PropTypes.number,
};

export default RollChart;
