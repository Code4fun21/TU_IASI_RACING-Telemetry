import { useEffect, useMemo, useState } from "react";
import ReactECharts from "echarts-for-react";

export function FilterComparisonChart({
    timeMs,
    rawValues,
    filteredValues,
    residualValues,
    channelLabel,
    unit
}) {
    const option = useMemo(() => {
        if (!timeMs || !rawValues || !filteredValues) return {};
        const step = timeMs.length > 20000 ? Math.ceil(timeMs.length / 20000) : 1;
        const rawPts = [];
        const filtPts = [];
        const resPts = [];

        for (let i = 0; i < timeMs.length; i += step) {
            rawPts.push([timeMs[i], rawValues[i]]);
            filtPts.push([timeMs[i], filteredValues[i]]);
            if (residualValues) resPts.push([timeMs[i], residualValues[i]]);
        }

        return {
            animation: false,
            backgroundColor: "transparent",
            tooltip: {
                trigger: "axis",
                backgroundColor: "rgba(15, 23, 42, 0.95)",
                borderColor: "#334155",
                textStyle: { color: "#f8fafc", fontSize: 12 }
            },
            legend: {
                data: ["Raw Signal", "Filtered Signal", "Residual Noise"],
                textStyle: { color: "#cbd5e1" },
                top: 4
            },
            grid: [
                { left: 60, right: 24, top: 42, height: "52%" },
                { left: 60, right: 24, top: "68%", height: "22%" }
            ],
            xAxis: [
                { type: "time", gridIndex: 0, axisLabel: { show: false }, splitLine: { lineStyle: { color: "#1e293b" } } },
                {
                    type: "time",
                    gridIndex: 1,
                    axisLabel: { color: "#94a3b8", formatter: (v) => new Date(v).toISOString().slice(14, 21) },
                    splitLine: { lineStyle: { color: "#1e293b" } }
                }
            ],
            yAxis: [
                {
                    type: "value",
                    gridIndex: 0,
                    name: `${channelLabel} (${unit})`,
                    nameTextStyle: { color: "#94a3b8" },
                    axisLabel: { color: "#94a3b8" },
                    splitLine: { lineStyle: { color: "#1e293b" } }
                },
                {
                    type: "value",
                    gridIndex: 1,
                    name: "Residual",
                    nameTextStyle: { color: "#94a3b8" },
                    axisLabel: { color: "#94a3b8" },
                    splitLine: { lineStyle: { color: "#1e293b" } }
                }
            ],
            dataZoom: [
                { type: "inside", xAxisIndex: [0, 1] },
                { type: "slider", xAxisIndex: [0, 1], height: 18, bottom: 4 }
            ],
            series: [
                {
                    name: "Raw Signal",
                    type: "line",
                    xAxisIndex: 0,
                    yAxisIndex: 0,
                    data: rawPts,
                    showSymbol: false,
                    lineStyle: { color: "rgba(148, 163, 184, 0.55)", width: 1.2 }
                },
                {
                    name: "Filtered Signal",
                    type: "line",
                    xAxisIndex: 0,
                    yAxisIndex: 0,
                    data: filtPts,
                    showSymbol: false,
                    lineStyle: { color: "#10b981", width: 2.2 }
                },
                {
                    name: "Residual Noise",
                    type: "line",
                    xAxisIndex: 1,
                    yAxisIndex: 1,
                    data: resPts,
                    showSymbol: false,
                    lineStyle: { color: "#f43f5e", width: 1.2 }
                }
            ]
        };
    }, [timeMs, rawValues, filteredValues, residualValues, channelLabel, unit]);

    return (
        <div className="bg-gray-900/90 border border-gray-800 rounded-lg p-4">
            <ReactECharts option={option} style={{ height: 420, width: "100%" }} notMerge={true} />
        </div>
    );
}

export function FFTChart({ allChannels, labels, timeMs, runTask }) {
    const channelKeys = Object.keys(allChannels);
    const [selectedKey, setSelectedKey] = useState(
        allChannels.Acceleration_on_X_axis ? "Acceleration_on_X_axis" : channelKeys[0] || ""
    );
    const [fftData, setFftData] = useState(null);

    useEffect(() => {
        const values = allChannels[selectedKey];
        if (!values || !timeMs || timeMs.length < 8) return;
        let cancelled = false;
        runTask("FFT", { timeMs, values })
            .then((res) => {
                if (!cancelled) setFftData(res);
            })
            .catch(() => {});
        return () => {
            cancelled = true;
        };
    }, [selectedKey, allChannels, timeMs, runTask]);

    const option = useMemo(() => {
        if (!fftData || !fftData.freqs) return {};
        const pairs = [];
        for (let i = 1; i < fftData.freqs.length; i++) {
            pairs.push([Number(fftData.freqs[i].toFixed(2)), Number(fftData.magnitudes[i].toFixed(5))]);
        }

        return {
            animation: false,
            backgroundColor: "transparent",
            tooltip: {
                trigger: "axis",
                backgroundColor: "rgba(15, 23, 42, 0.95)",
                borderColor: "#334155",
                textStyle: { color: "#f8fafc", fontSize: 12 },
                formatter: (p) => {
                    if (!p.length) return "";
                    return `Frequency: <b>${p[0].value[0]} Hz</b><br/>Amplitude: <b>${p[0].value[1]}</b>`;
                }
            },
            grid: { left: 60, right: 24, top: 35, bottom: 45 },
            xAxis: {
                type: "value",
                name: "Frequency (Hz)",
                nameLocation: "middle",
                nameGap: 26,
                nameTextStyle: { color: "#94a3b8" },
                axisLabel: { color: "#94a3b8" },
                splitLine: { lineStyle: { color: "#1e293b" } }
            },
            yAxis: {
                type: "value",
                name: "Magnitude",
                nameTextStyle: { color: "#94a3b8" },
                axisLabel: { color: "#94a3b8" },
                splitLine: { lineStyle: { color: "#1e293b" } }
            },
            series: [
                {
                    type: "line",
                    data: pairs,
                    showSymbol: false,
                    areaStyle: { color: "rgba(99, 102, 241, 0.22)" },
                    lineStyle: { color: "#818cf8", width: 2 }
                }
            ]
        };
    }, [fftData]);

    return (
        <div className="bg-gray-900/90 border border-gray-800 rounded-lg p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-xs text-gray-300">
                    <span>Inspect Channel FFT:</span>
                    <select
                        value={selectedKey}
                        onChange={(e) => setSelectedKey(e.target.value)}
                        className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-white"
                    >
                        {channelKeys.map((k) => (
                            <option key={k} value={k}>
                                {labels[k] || k}
                            </option>
                        ))}
                    </select>
                </div>
                {fftData && (
                    <div className="text-xs text-indigo-300 font-mono">
                        Fs: {fftData.fs.toFixed(1)} Hz | Dominant Peak: <b>{fftData.dominantHz.toFixed(2)} Hz</b>
                    </div>
                )}
            </div>
            <ReactECharts option={option} style={{ height: 340, width: "100%" }} notMerge={true} />
        </div>
    );
}

export function DamperHistogramChart({ allChannels, timeMs, runTask }) {
    const damperKeys = ["Damper_Left_Front", "Damper_Right_Front", "Damper_Left_Rear", "Damper_Right_Rear"].filter(
        (k) => Boolean(allChannels[k])
    );
    const [selectedDamper, setSelectedDamper] = useState(damperKeys[0] || "");
    const [velArray, setVelArray] = useState(null);

    useEffect(() => {
        const pos = allChannels[selectedDamper];
        if (!pos || !timeMs) return;
        let cancelled = false;
        runTask("DERIVATIVE", { timeMs, values: pos, scaleFactor: 10 })
            .then((vel) => {
                if (!cancelled) setVelArray(vel);
            })
            .catch(() => {});
        return () => {
            cancelled = true;
        };
    }, [selectedDamper, allChannels, timeMs, runTask]);

    const { bins, stats } = useMemo(() => {
        if (!velArray || velArray.length === 0) return { bins: [], stats: null };
        const edges = [-250, -150, -100, -50, -25, 0, 25, 50, 100, 150, 250];
        const counts = new Array(edges.length - 1).fill(0);
        let hsRebound = 0;
        let lsRebound = 0;
        let lsBump = 0;
        let hsBump = 0;

        for (let i = 0; i < velArray.length; i++) {
            const v = velArray[i];
            if (v < -50) hsRebound++;
            else if (v < 0) lsRebound++;
            else if (v <= 50) lsBump++;
            else hsBump++;

            for (let b = 0; b < edges.length - 1; b++) {
                if (v >= edges[b] && v < edges[b + 1]) {
                    counts[b]++;
                    break;
                }
            }
        }

        const total = velArray.length || 1;
        const formattedBins = counts.map((c, idx) => ({
            label: `${edges[idx]} to ${edges[idx + 1]}`,
            pct: Number(((c / total) * 100).toFixed(2)),
            isHighSpeed: edges[idx] < -50 || edges[idx + 1] > 50
        }));

        return {
            bins: formattedBins,
            stats: {
                hsRebound: ((hsRebound / total) * 100).toFixed(1),
                lsRebound: ((lsRebound / total) * 100).toFixed(1),
                lsBump: ((lsBump / total) * 100).toFixed(1),
                hsBump: ((hsBump / total) * 100).toFixed(1)
            }
        };
    }, [velArray]);

    const option = useMemo(() => {
        return {
            animation: false,
            backgroundColor: "transparent",
            tooltip: {
                trigger: "axis",
                backgroundColor: "rgba(15, 23, 42, 0.95)",
                borderColor: "#334155",
                textStyle: { color: "#f8fafc", fontSize: 12 },
                formatter: (p) => `${p[0].name} mm/s: <b>${p[0].value}%</b>`
            },
            grid: { left: 55, right: 20, top: 30, bottom: 55 },
            xAxis: {
                type: "category",
                data: bins.map((b) => b.label),
                axisLabel: { color: "#94a3b8", fontSize: 10, rotate: 25 }
            },
            yAxis: {
                type: "value",
                name: "Time in Band (%)",
                nameTextStyle: { color: "#94a3b8" },
                axisLabel: { color: "#94a3b8", formatter: "{value}%" },
                splitLine: { lineStyle: { color: "#1e293b" } }
            },
            series: [
                {
                    type: "bar",
                    data: bins.map((b) => ({
                        value: b.pct,
                        itemStyle: { color: b.isHighSpeed ? "#f59e0b" : "#3b82f6" }
                    }))
                }
            ]
        };
    }, [bins]);

    return (
        <div className="bg-gray-900/90 border border-gray-800 rounded-lg p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-xs text-gray-300">
                    <span>Damper Corner:</span>
                    <select
                        value={selectedDamper}
                        onChange={(e) => setSelectedDamper(e.target.value)}
                        className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-white"
                    >
                        {damperKeys.map((k) => (
                            <option key={k} value={k}>
                                {k}
                            </option>
                        ))}
                    </select>
                </div>
                {stats && (
                    <div className="flex flex-wrap gap-3 text-xs font-mono">
                        <span className="text-amber-400">HS Rebound: {stats.hsRebound}%</span>
                        <span className="text-blue-400">LS Rebound: {stats.lsRebound}%</span>
                        <span className="text-blue-400">LS Bump: {stats.lsBump}%</span>
                        <span className="text-amber-400">HS Bump: {stats.hsBump}%</span>
                    </div>
                )}
            </div>
            <ReactECharts option={option} style={{ height: 320, width: "100%" }} notMerge={true} />
        </div>
    );
}

export function CustomXYChart({ allChannels, labels, units }) {
    const keys = Object.keys(allChannels);
    const [xKey, setXKey] = useState(allChannels.Steering_Angle ? "Steering_Angle" : keys[0] || "");
    const [yKey, setYKey] = useState(allChannels.Acceleration_on_X_axis ? "Acceleration_on_X_axis" : keys[1] || keys[0] || "");

    const points = useMemo(() => {
        const xArr = allChannels[xKey];
        const yArr = allChannels[yKey];
        if (!xArr || !yArr) return [];
        const n = Math.min(xArr.length, yArr.length);
        const step = n > 8000 ? Math.ceil(n / 8000) : 1;
        const pts = [];
        for (let i = 0; i < n; i += step) {
            pts.push([xArr[i], yArr[i]]);
        }
        return pts;
    }, [allChannels, xKey, yKey]);

    const option = useMemo(() => {
        return {
            animation: false,
            backgroundColor: "transparent",
            tooltip: {
                trigger: "item",
                backgroundColor: "rgba(15, 23, 42, 0.95)",
                borderColor: "#334155",
                textStyle: { color: "#f8fafc", fontSize: 12 },
                formatter: (p) =>
                    `${labels[xKey] || xKey}: <b>${p.value[0].toFixed(2)}</b><br/>${labels[yKey] || yKey}: <b>${p.value[1].toFixed(2)}</b>`
            },
            grid: { left: 60, right: 24, top: 30, bottom: 45 },
            xAxis: {
                type: "value",
                name: `${labels[xKey] || xKey} (${units[xKey] || "-"})`,
                nameLocation: "middle",
                nameGap: 26,
                nameTextStyle: { color: "#94a3b8" },
                axisLabel: { color: "#94a3b8" },
                splitLine: { lineStyle: { color: "#1e293b" } }
            },
            yAxis: {
                type: "value",
                name: `${labels[yKey] || yKey} (${units[yKey] || "-"})`,
                nameTextStyle: { color: "#94a3b8" },
                axisLabel: { color: "#94a3b8" },
                splitLine: { lineStyle: { color: "#1e293b" } }
            },
            series: [
                {
                    type: "scatter",
                    symbolSize: 5,
                    data: points,
                    itemStyle: { color: "#38bdf8", opacity: 0.7 }
                }
            ]
        };
    }, [points, xKey, yKey, labels, units]);

    return (
        <div className="bg-gray-900/90 border border-gray-800 rounded-lg p-4 space-y-3">
            <div className="flex flex-wrap items-center gap-4 text-xs text-gray-300">
                <div className="flex items-center gap-2">
                    <span>X-Axis:</span>
                    <select
                        value={xKey}
                        onChange={(e) => setXKey(e.target.value)}
                        className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-white"
                    >
                        {keys.map((k) => (
                            <option key={k} value={k}>
                                {labels[k] || k}
                            </option>
                        ))}
                    </select>
                </div>
                <div className="flex items-center gap-2">
                    <span>Y-Axis:</span>
                    <select
                        value={yKey}
                        onChange={(e) => setYKey(e.target.value)}
                        className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-white"
                    >
                        {keys.map((k) => (
                            <option key={k} value={k}>
                                {labels[k] || k}
                            </option>
                        ))}
                    </select>
                </div>
            </div>
            <ReactECharts option={option} style={{ height: 350, width: "100%" }} notMerge={true} />
        </div>
    );
}

export function LapOverlayChart({ allChannels, labels, units, timeMs, gatesData }) {
    const channelKeys = Object.keys(allChannels).filter((k) => k !== "Distance" && k !== "Lap_Distance");
    const [channelKey, setChannelKey] = useState(allChannels.GPS_Speed ? "GPS_Speed" : channelKeys[0] || "");
    const laps = gatesData?.lap_data || [];
    const [selectedLaps, setSelectedLaps] = useState(() => laps.map((_, idx) => idx));

    const toggleLap = (idx) => {
        setSelectedLaps((prev) => (prev.includes(idx) ? prev.filter((i) => i !== idx) : [...prev, idx]));
    };

    const lapSeries = useMemo(() => {
        const distArr = allChannels.Distance;
        const valArr = allChannels[channelKey];
        if (!distArr || !valArr || !timeMs || laps.length === 0) return [];

        const colors = ["#6366f1", "#10b981", "#f43f5e", "#f59e0b", "#06b6d4"];

        return selectedLaps
            .map((lapIdx) => {
                const lap = laps[lapIdx];
                if (!lap || !lap.S0) return null;
                const startTs = Number(lap.S0);
                const endTs = Number(lap.S3 || lap.ts || timeMs[timeMs.length - 1]);

                const pts = [];
                let baseDist = null;
                for (let i = 0; i < timeMs.length; i++) {
                    const t = timeMs[i];
                    if (t >= startTs && t <= endTs) {
                        if (baseDist === null) baseDist = distArr[i];
                        pts.push([Number((distArr[i] - baseDist).toFixed(2)), valArr[i]]);
                    }
                }

                return {
                    name: `Lap ${lapIdx + 1}`,
                    type: "line",
                    data: pts,
                    showSymbol: false,
                    lineStyle: { color: colors[lapIdx % colors.length], width: 2 }
                };
            })
            .filter(Boolean);
    }, [allChannels, channelKey, timeMs, laps, selectedLaps]);

    const option = useMemo(() => {
        return {
            animation: false,
            backgroundColor: "transparent",
            tooltip: {
                trigger: "axis",
                backgroundColor: "rgba(15, 23, 42, 0.95)",
                borderColor: "#334155",
                textStyle: { color: "#f8fafc", fontSize: 12 }
            },
            legend: { textStyle: { color: "#cbd5e1" }, top: 4 },
            grid: { left: 60, right: 24, top: 40, bottom: 45 },
            xAxis: {
                type: "value",
                name: "Lap Distance (m)",
                nameLocation: "middle",
                nameGap: 26,
                nameTextStyle: { color: "#94a3b8" },
                axisLabel: { color: "#94a3b8" },
                splitLine: { lineStyle: { color: "#1e293b" } }
            },
            yAxis: {
                type: "value",
                name: `${labels[channelKey] || channelKey} (${units[channelKey] || "-"})`,
                nameTextStyle: { color: "#94a3b8" },
                axisLabel: { color: "#94a3b8" },
                splitLine: { lineStyle: { color: "#1e293b" } }
            },
            dataZoom: [{ type: "inside" }, { type: "slider", height: 18, bottom: 4 }],
            series: lapSeries
        };
    }, [lapSeries, channelKey, labels, units]);

    return (
        <div className="bg-gray-900/90 border border-gray-800 rounded-lg p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2 text-gray-300">
                    <span>Overlay Channel:</span>
                    <select
                        value={channelKey}
                        onChange={(e) => setChannelKey(e.target.value)}
                        className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-white"
                    >
                        {channelKeys.map((k) => (
                            <option key={k} value={k}>
                                {labels[k] || k}
                            </option>
                        ))}
                    </select>
                </div>
                <div className="flex flex-wrap gap-2">
                    {laps.map((_, idx) => (
                        <button
                            key={idx}
                            onClick={() => toggleLap(idx)}
                            className={`px-2.5 py-1 rounded border ${
                                selectedLaps.includes(idx)
                                    ? "bg-indigo-600 border-indigo-500 text-white"
                                    : "bg-gray-800 border-gray-700 text-gray-400"
                            }`}
                        >
                            Lap {idx + 1}
                        </button>
                    ))}
                </div>
            </div>
            <ReactECharts option={option} style={{ height: 350, width: "100%" }} notMerge={true} />
        </div>
    );
}