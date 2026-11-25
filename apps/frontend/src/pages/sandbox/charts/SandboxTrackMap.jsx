import { useMemo, useState } from "react";
import ReactECharts from "echarts-for-react";
import MapChart from "../../../components/MapChart";

const MAP_COLOR_CHANNELS = [
    { key: "GPS_Speed", label: "GPS Speed (km/h)" },
    { key: "Gear", label: "Gear" },
    { key: "Brake_Pressure", label: "Brake Pressure (bar)" },
    { key: "Acceleration_on_X_axis", label: "Lateral G (G)" }
];

export default function SandboxTrackMap({ allChannels, timeMs, geoData, gatesData, height = 460 }) {
    const [colorKey, setColorKey] = useState("GPS_Speed");

    const availableColorOptions = MAP_COLOR_CHANNELS.filter((c) => Boolean(allChannels[c.key]));

    const activeColorKey = allChannels[colorKey]
        ? colorKey
        : availableColorOptions[0]?.key || "GPS_Speed";

    const { points, minC, maxC, mapChartLegacyData } = useMemo(() => {
        const lat = allChannels.GPS_Latitude;
        const lon = allChannels.GPS_Longitude;
        const valArr = allChannels[activeColorKey];
        if (!lat || !lon) return { points: [], minC: 0, maxC: 100, mapChartLegacyData: [] };

        const n = Math.min(lat.length, lon.length);
        const step = n > 6000 ? Math.ceil(n / 6000) : 1;
        const pts = [];
        const legacy = [];
        let cMin = Infinity;
        let cMax = -Infinity;

        for (let i = 0; i < n; i += step) {
            const la = lat[i];
            const lo = loVal(lon[i]);
            if (!Number.isFinite(la) || !Number.isFinite(lo) || la === 0 || lo === 0) continue;
            const v = valArr && i < valArr.length ? valArr[i] : 0;
            if (v < cMin) cMin = v;
            if (v > cMax) cMax = v;
            pts.push([lo, la, v]);
            legacy.push([lo, la, v, timeMs[i] || 0]);
        }

        function loVal(v) {
            return v;
        }

        return {
            points: pts,
            minC: Number.isFinite(cMin) ? cMin : 0,
            maxC: Number.isFinite(cMax) && cMax > cMin ? cMax : 1,
            mapChartLegacyData: legacy
        };
    }, [allChannels, activeColorKey, timeMs]);

    const option = useMemo(() => {
        return {
            animation: false,
            backgroundColor: "transparent",
            tooltip: {
                trigger: "item",
                backgroundColor: "rgba(15, 23, 42, 0.95)",
                borderColor: "#334155",
                textStyle: { color: "#f8fafc", fontSize: 12 },
                formatter: (p) => {
                    const [lo, la, v] = p.value;
                    return `Lat: ${la.toFixed(6)}<br/>Lon: ${lo.toFixed(6)}<br/>${activeColorKey}: <b>${Number(v).toFixed(2)}</b>`;
                }
            },
            visualMap: {
                min: minC,
                max: maxC,
                calculable: true,
                orient: "vertical",
                right: 10,
                top: "center",
                textStyle: { color: "#cbd5e1" },
                inRange: {
                    color: ["#2563eb", "#06b6d4", "#10b981", "#eab308", "#ef4444"]
                }
            },
            grid: { left: 45, right: 80, top: 25, bottom: 35 },
            xAxis: {
                type: "value",
                scale: true,
                name: "Longitude",
                axisLabel: { color: "#94a3b8", fontSize: 10 },
                splitLine: { lineStyle: { color: "#1e293b" } }
            },
            yAxis: {
                type: "value",
                scale: true,
                name: "Latitude",
                axisLabel: { color: "#94a3b8", fontSize: 10 },
                splitLine: { lineStyle: { color: "#1e293b" } }
            },
            series: [
                {
                    type: "scatter",
                    symbolSize: 6,
                    data: points
                }
            ]
        };
    }, [points, minC, maxC, activeColorKey]);

    return (
        <div className="bg-gray-900/90 border border-gray-800 rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-white">2D GPS Track Heatmap</h4>
                <div className="flex items-center gap-2 text-xs text-gray-300">
                    <span>Color Track By:</span>
                    <select
                        value={activeColorKey}
                        onChange={(e) => setColorKey(e.target.value)}
                        className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-white"
                    >
                        {availableColorOptions.map((opt) => (
                            <option key={opt.key} value={opt.key}>
                                {opt.label}
                            </option>
                        ))}
                    </select>
                </div>
            </div>

            {geoData ? (
                <div className="h-[430px] rounded overflow-hidden bg-gray-950">
                    <MapChart
                        geoData={geoData}
                        data={mapChartLegacyData}
                        gates={gatesData}
                        width="100%"
                        height="100%"
                    />
                </div>
            ) : (
                <ReactECharts option={option} style={{ height, width: "100%" }} notMerge={true} />
            )}
        </div>
    );
}