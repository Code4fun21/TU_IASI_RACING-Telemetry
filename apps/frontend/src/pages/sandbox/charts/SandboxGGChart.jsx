import { useMemo, useState } from "react";
import ReactECharts from "echarts-for-react";

function buildCircleRing(radius, steps = 72) {
    const pts = [];
    for (let i = 0; i <= steps; i++) {
        const theta = (2 * Math.PI * i) / steps;
        pts.push([
            Number((radius * Math.cos(theta)).toFixed(3)),
            Number((radius * Math.sin(theta)).toFixed(3))
        ]);
    }
    return pts;
}

export default function SandboxGGChart({ allChannels, labels = {}, height = 780 }) {
    const channelKeys = Object.keys(allChannels || {});
    const [xKey, setXKey] = useState("Acceleration_on_X_axis");
    const [yKey, setYKey] = useState("Acceleration_on_Y_axis");
    const [colorBy, setColorBy] = useState("GPS_Speed");

    const activeXKey = allChannels[xKey] ? xKey : "Acceleration_on_X_axis";
    const activeYKey = allChannels[yKey] ? yKey : "Acceleration_on_Y_axis";

    const { scatterPoints, envelopeData, minVal, maxVal, colorUnit } = useMemo(() => {
        const lat = allChannels[activeXKey];
        const lon = allChannels[activeYKey];
        if (!lat || !lon) {
            return { scatterPoints: [], envelopeData: [], minVal: 0, maxVal: 100, colorUnit: "" };
        }

        const colorArr = allChannels[colorBy];
        const n = Math.min(lat.length, lon.length);
        const step = n > 8000 ? Math.ceil(n / 8000) : 1;

        const pts = [];
        let cMin = Infinity;
        let cMax = -Infinity;

        const numBins = 36;
        const bins = Array.from({ length: numBins }, () => []);

        for (let i = 0; i < n; i += step) {
            const x = lat[i];
            const y = lon[i];
            if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
            const c = colorArr && i < colorArr.length ? colorArr[i] : Math.hypot(x, y);
            if (c < cMin) cMin = c;
            if (c > cMax) cMax = c;
            pts.push([x, y, c]);

            const radius = Math.hypot(x, y);
            if (radius >= 0.2) {
                let angle = Math.atan2(y, x) * (180 / Math.PI);
                if (angle < 0) angle += 360;
                const binIdx = Math.floor(angle / (360 / numBins)) % numBins;
                bins[binIdx].push({ x, y, radius });
            }
        }

        const env = [];
        bins.forEach((bin) => {
            if (bin.length > 4) {
                bin.sort((a, b) => a.radius - b.radius);
                const idx = Math.floor(bin.length * 0.95);
                env.push([bin[idx].x, bin[idx].y]);
            }
        });
        if (env.length > 0) env.push(env[0]);

        const unitMap = {
            GPS_Speed: "km/h",
            Throttle_position: "%",
            Brake_Pressure: "bar",
            Combined_G: "G"
        };

        return {
            scatterPoints: pts,
            envelopeData: env,
            minVal: Number.isFinite(cMin) ? Math.floor(cMin) : 0,
            maxVal: Number.isFinite(cMax) && cMax > cMin ? Math.ceil(cMax) : 100,
            colorUnit: unitMap[colorBy] || ""
        };
    }, [allChannels, activeXKey, activeYKey, colorBy]);

    const option = useMemo(() => {
        const ring05 = buildCircleRing(0.5);
        const ring10 = buildCircleRing(1.0);
        const ring15 = buildCircleRing(1.5);
        const colorTitle = labels[colorBy] || colorBy;

        return {
            animation: false,
            backgroundColor: "transparent",
            title: {
                text: "Traction Circle (G-G Diagram)",
                left: "center",
                textStyle: { color: "#f8fafc", fontSize: 16 }
            },
            tooltip: {
                backgroundColor: "rgba(15, 23, 42, 0.95)",
                borderColor: "#334155",
                textStyle: { color: "#f8fafc", fontSize: 12 },
                formatter: (params) => {
                    if (params.seriesName !== "Telemetry") return params.seriesName;
                    const [gx, gy, cVal] = params.value;
                    return `${labels[activeXKey] || "Lateral G"}: <b>${gx.toFixed(2)} G</b><br/>${labels[activeYKey] || "Longitudinal G"}: <b>${gy.toFixed(2)} G</b><br/>${colorTitle}: <b>${Number(cVal).toFixed(1)} ${colorUnit}</b>`;
                }
            },
            visualMap: {
                min: minVal,
                max: maxVal,
                calculable: true,
                orient: "vertical",
                right: 10,
                top: "center",
                textStyle: { color: "#cbd5e1" },
                inRange: {
                    color: ["#3b82f6", "#06b6d4", "#10b981", "#facc15", "#f97316", "#ef4444"]
                },
                seriesIndex: 0
            },
            grid: { left: 60, right: 100, top: 45, bottom: 45 },
            xAxis: {
                type: "value",
                name: labels[activeXKey] || "Lateral G",
                nameLocation: "middle",
                nameGap: 26,
                min: -2.2,
                max: 2.2,
                nameTextStyle: { color: "#94a3b8" },
                axisLabel: { color: "#94a3b8", formatter: "{value}G" },
                splitLine: { lineStyle: { color: "#1e293b" } }
            },
            yAxis: {
                type: "value",
                name: labels[activeYKey] || "Longitudinal G",
                nameLocation: "middle",
                nameGap: 38,
                min: -2.2,
                max: 2.2,
                nameTextStyle: { color: "#94a3b8" },
                axisLabel: { color: "#94a3b8", formatter: "{value}G" },
                splitLine: { lineStyle: { color: "#1e293b" } }
            },
            series: [
                {
                    name: "Telemetry",
                    type: "scatter",
                    symbolSize: 6,
                    data: scatterPoints,
                    itemStyle: { opacity: 0.78 },
                    zlevel: 2
                },
                {
                    name: "95% Grip Envelope",
                    type: "line",
                    data: envelopeData,
                    smooth: true,
                    symbol: "none",
                    lineStyle: { color: "#f43f5e", width: 2.5, type: "dashed" },
                    zlevel: 3
                },
                {
                    name: "0.5G Ring",
                    type: "line",
                    data: ring05,
                    symbol: "none",
                    silent: true,
                    lineStyle: { color: "#475569", width: 1, type: "dotted" },
                    zlevel: 1
                },
                {
                    name: "1.0G Ring",
                    type: "line",
                    data: ring10,
                    symbol: "none",
                    silent: true,
                    lineStyle: { color: "#64748b", width: 1.2, type: "dashed" },
                    zlevel: 1
                },
                {
                    name: "1.5G Ring",
                    type: "line",
                    data: ring15,
                    symbol: "none",
                    silent: true,
                    lineStyle: { color: "#94a3b8", width: 1.2, type: "dotted" },
                    zlevel: 1
                }
            ]
        };
    }, [scatterPoints, envelopeData, minVal, maxVal, colorBy, colorUnit, labels, activeXKey, activeYKey]);

    const colorOptions = ["GPS_Speed", "Throttle_position", "Brake_Pressure", "Combined_G"].filter(
        (k) => Boolean(allChannels[k])
    );

    return (
        <div className="bg-gray-900/90 border border-gray-800 rounded-lg p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-gray-300">
                <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-1.5">
                        <span>Lateral (X):</span>
                        <select
                            value={activeXKey}
                            onChange={(e) => setXKey(e.target.value)}
                            className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-white"
                        >
                            {channelKeys.map((k) => (
                                <option key={k} value={k}>
                                    {labels[k] || k}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="flex items-center gap-1.5">
                        <span>Longitudinal (Y):</span>
                        <select
                            value={activeYKey}
                            onChange={(e) => setYKey(e.target.value)}
                            className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-white"
                        >
                            {channelKeys.map((k) => (
                                <option key={k} value={k}>
                                    {labels[k] || k}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>

                <div className="flex items-center gap-1.5">
                    <span>Color By:</span>
                    <select
                        value={colorBy}
                        onChange={(e) => setColorBy(e.target.value)}
                        className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-white"
                    >
                        {colorOptions.map((k) => (
                            <option key={k} value={k}>
                                {labels[k] || k}
                            </option>
                        ))}
                    </select>
                </div>
            </div>

            <div className="w-full overflow-x-auto">
                <ReactECharts
                    option={option}
                    style={{ height: height, width: height + 80, margin: "0 auto" }}
                    notMerge={true}
                />
            </div>
        </div>
    );
}