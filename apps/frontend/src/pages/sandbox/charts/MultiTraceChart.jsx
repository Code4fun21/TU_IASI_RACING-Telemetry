import { useEffect, useMemo, useRef } from "react";
import ReactECharts from "echarts-for-react";
import * as echarts from "echarts";

const TRACE_COLORS = ["#6366f1", "#10b981", "#f43f5e", "#06b6d4", "#f59e0b", "#a855f7"];

function SingleSyncedPane({
    channelKey,
    label,
    unit,
    xAxisData,
    values,
    xAxisMode,
    anomalies,
    color,
    isLast,
    onRegionSelect
}) {
    const chartRef = useRef(null);

    const seriesPairs = useMemo(() => {
        const len = Math.min(xAxisData.length, values.length);
        const step = len > 25000 ? Math.ceil(len / 25000) : 1;
        const pts = [];
        for (let i = 0; i < len; i += step) {
            pts.push([xAxisData[i], values[i]]);
        }
        return pts;
    }, [xAxisData, values]);

    const markAreas = useMemo(() => {
        if (xAxisMode !== "time" || !anomalies || anomalies.length === 0) return [];
        return anomalies.map((a) => [
            {
                name: a.label,
                xAxis: a.startTime,
                itemStyle: {
                    color: a.type === "dropout" ? "rgba(239, 68, 68, 0.18)" : "rgba(245, 158, 11, 0.18)"
                }
            },
            { xAxis: a.endTime }
        ]);
    }, [anomalies, xAxisMode]);

    const option = useMemo(() => {
        return {
            animation: false,
            backgroundColor: "transparent",
            tooltip: {
                trigger: "axis",
                axisPointer: {
                    type: "cross",
                    lineStyle: { color: "#94a3b8", width: 1 }
                },
                backgroundColor: "rgba(15, 23, 42, 0.94)",
                borderColor: "#334155",
                textStyle: { color: "#f8fafc", fontSize: 12 },
                formatter: (params) => {
                    if (!Array.isArray(params) || !params.length) return "";
                    const pt = params[0];
                    const xVal = pt.value[0];
                    const yVal = Number(pt.value[1]).toFixed(3);
                    const xFormatted =
                        xAxisMode === "distance"
                            ? `${Number(xVal).toFixed(1)} m`
                            : new Date(xVal).toISOString().slice(11, 23);
                    return `<div style="font-family:monospace">
                        <div style="color:#94a3b8;margin-bottom:2px">${xFormatted}</div>
                        <span style="color:${color}">●</span> <b>${label}</b>: ${yVal} ${unit || ""}
                    </div>`;
                }
            },
            toolbox: {
                right: 16,
                top: 2,
                feature: {
                    brush: {
                        type: ["lineX", "clear"],
                        title: { lineX: "Drag to measure region", clear: "Clear selection" }
                    }
                },
                iconStyle: { borderColor: "#94a3b8" }
            },
            brush: {
                xAxisIndex: 0,
                brushMode: "single",
                brushStyle: {
                    borderWidth: 1,
                    color: "rgba(99, 102, 241, 0.18)",
                    borderColor: "rgba(99, 102, 241, 0.8)"
                }
            },
            grid: {
                left: 68,
                right: 24,
                top: 26,
                bottom: isLast ? 48 : 16
            },
            xAxis: {
                type: xAxisMode === "distance" ? "value" : "time",
                boundaryGap: false,
                axisLine: { lineStyle: { color: "#334155" } },
                axisLabel: {
                    show: isLast,
                    color: "#94a3b8",
                    fontSize: 11,
                    formatter: (val) =>
                        xAxisMode === "distance"
                            ? `${Math.round(val)}m`
                            : new Date(val).toISOString().slice(14, 21)
                },
                splitLine: { show: true, lineStyle: { color: "#1e293b" } }
            },
            yAxis: {
                type: "value",
                name: `${label} (${unit || "-"})`,
                nameTextStyle: { color: "#cbd5e1", fontSize: 11, align: "left", padding: [0, 0, 0, -45] },
                axisLine: { show: true, lineStyle: { color: "#334155" } },
                axisLabel: { color: "#94a3b8", fontSize: 11 },
                splitLine: { lineStyle: { color: "#1e293b" } }
            },
            dataZoom: [
                {
                    type: "inside",
                    xAxisIndex: 0,
                    filterMode: "none"
                },
                ...(isLast
                    ? [
                          {
                              type: "slider",
                              xAxisIndex: 0,
                              height: 18,
                              bottom: 6,
                              borderColor: "#334155",
                              fillerColor: "rgba(99, 102, 241, 0.25)",
                              textStyle: { color: "#94a3b8" }
                          }
                      ]
                    : [])
            ],
            series: [
                {
                    name: label,
                    type: "line",
                    data: seriesPairs,
                    showSymbol: false,
                    sampling: xAxisMode === "time" ? "lttb" : undefined,
                    lineStyle: { color, width: 1.8 },
                    markArea: markAreas.length ? { silent: true, data: markAreas } : undefined
                }
            ]
        };
    }, [seriesPairs, xAxisMode, color, label, unit, isLast, markAreas]);

    useEffect(() => {
        const inst = chartRef.current?.getEchartsInstance();
        if (!inst) return;
        inst.group = "sandbox_sync";
        echarts.connect("sandbox_sync");

        const handleBrushEnd = (params) => {
            const areas = params?.areas;
            if (!areas || areas.length === 0) return;
            const range = areas[0].coordRange;
            if (Array.isArray(range) && range.length === 2 && onRegionSelect) {
                onRegionSelect(range[0], range[1], channelKey);
            }
        };

        inst.on("brushEnd", handleBrushEnd);
        return () => {
            inst.off("brushEnd", handleBrushEnd);
        };
    }, [channelKey, onRegionSelect]);

    return (
        <div className="bg-gray-900/90 border border-gray-800 rounded-lg overflow-hidden">
            <ReactECharts
                ref={chartRef}
                option={option}
                style={{ height: isLast ? 225 : 185, width: "100%" }}
                notMerge={true}
            />
        </div>
    );
}

export default function MultiTraceChart({
    selectedChannels,
    allChannels,
    labels,
    units,
    anomalies,
    timeMs,
    distanceM,
    xAxisMode,
    onRegionSelect
}) {
    const xAxisData = xAxisMode === "distance" && distanceM?.length ? distanceM : timeMs;

    if (!selectedChannels || selectedChannels.length === 0) {
        return (
            <div className="p-8 text-center text-gray-400 bg-gray-900/60 border border-gray-800 rounded-lg">
                Select one or more channels above to plot synchronized traces.
            </div>
        );
    }

    return (
        <div className="space-y-2">
            {selectedChannels.map((key, idx) => {
                const values = allChannels[key];
                if (!values) return null;
                return (
                    <SingleSyncedPane
                        key={key}
                        channelKey={key}
                        label={labels[key] || key}
                        unit={units[key] || ""}
                        xAxisData={xAxisData}
                        values={values}
                        xAxisMode={xAxisMode}
                        anomalies={anomalies?.[key] || []}
                        color={TRACE_COLORS[idx % TRACE_COLORS.length]}
                        isLast={idx === selectedChannels.length - 1}
                        onRegionSelect={onRegionSelect}
                    />
                );
            })}
        </div>
    );
}