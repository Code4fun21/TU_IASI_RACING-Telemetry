import { useEffect, useMemo, useRef } from "react";
import ReactECharts from "echarts-for-react";
import * as echarts from "echarts";

const TRACE_COLORS = ["#6366f1", "#10b981", "#f43f5e", "#06b6d4", "#f59e0b", "#a855f7"];

const haversineMeters = (lat1, lon1, lat2, lon2) => {
    const toRad = (d) => (d * Math.PI) / 180;
    const R = 6371000;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
};

const extractTrackPolyline = (geoData) => {
    if (!geoData?.features?.length) return [];
    const extractCoords = (feat) => {
        const g = feat?.geometry;
        if (!g) return [];
        if (g.type === "LineString") return g.coordinates || [];
        if (g.type === "Polygon") return g.coordinates?.[0] || [];
        if (g.type === "MultiLineString") return (g.coordinates || []).flat();
        return [];
    };

    const ring0 = extractCoords(geoData.features[0]);
    if (geoData.features.length < 2) return ring0;
    const ring1 = extractCoords(geoData.features[1]);
    if (!ring0.length || !ring1.length) return ring0;

    const len = Math.min(ring0.length, ring1.length);
    const center = [];
    for (let i = 0; i < len; i++) {
        center.push([(ring0[i][0] + ring1[i][0]) / 2, (ring0[i][1] + ring1[i][1]) / 2]);
    }
    return center;
};

const buildDistanceFromGps = (latArr, lonArr) => {
    const len = Math.min(latArr?.length || 0, lonArr?.length || 0);
    if (len === 0) return null;
    const dist = new Float64Array(len);
    let acc = 0;
    for (let i = 1; i < len; i++) {
        const lat1 = latArr[i - 1], lon1 = lonArr[i - 1];
        const lat2 = latArr[i], lon2 = lonArr[i];
        if (
            Number.isFinite(lat1) && Number.isFinite(lon1) &&
            Number.isFinite(lat2) && Number.isFinite(lon2) &&
            Math.abs(lat1) > 0.001 && Math.abs(lon1) > 0.001 &&
            Math.abs(lat2) > 0.001 && Math.abs(lon2) > 0.001
        ) {
            const step = haversineMeters(lat1, lon1, lat2, lon2);
            if (step < 150) acc += step;
        }
        dist[i] = acc;
    }
    return dist;
};

const computeCornerDistanceMarkers = ({
    gatesData,
    geoData,
    allChannels,
    timeMs,
    xAxisData
}) => {
    const markers = [];
    const polyline = extractTrackPolyline(geoData);

    const cumPolyDist = [];
    if (polyline.length > 1) {
        cumPolyDist.push(0);
        for (let i = 1; i < polyline.length; i++) {
            cumPolyDist.push(
                cumPolyDist[i - 1] +
                    haversineMeters(polyline[i - 1][1], polyline[i - 1][0], polyline[i][1], polyline[i][0])
            );
        }
    }

    const nearestTrackDistance = (lat, lon) => {
        if (polyline.length < 2 || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
        let bestIdx = 0;
        let bestSq = Infinity;
        const cosLat = Math.cos((lat * Math.PI) / 180);
        for (let i = 0; i < polyline.length; i++) {
            const dx = (polyline[i][0] - lon) * cosLat;
            const dy = polyline[i][1] - lat;
            const dSq = dx * dx + dy * dy;
            if (dSq < bestSq) {
                bestSq = dSq;
                bestIdx = i;
            }
        }
        return cumPolyDist[bestIdx] ?? null;
    };

    const gpsLat = allChannels?.GPS_Latitude || allChannels?.gps_lat || allChannels?.latitude;
    const gpsLon = allChannels?.GPS_Longitude || allChannels?.gps_lon || allChannels?.longitude;

    const distanceAtTime = (targetTime) => {
        if (!Array.isArray(timeMs) && !(timeMs instanceof Float64Array)) return null;
        if (!xAxisData || timeMs.length === 0) return null;
        let bestI = 0;
        let bestDiff = Math.abs(timeMs[0] - targetTime);
        for (let i = 1; i < timeMs.length; i++) {
            const diff = Math.abs(timeMs[i] - targetTime);
            if (diff < bestDiff) {
                bestDiff = diff;
                bestI = i;
            }
        }
        const xVal = xAxisData[bestI];
        return Number.isFinite(xVal) ? xVal : null;
    };

    if (Array.isArray(gatesData) && gatesData.length > 0) {
        gatesData.forEach((gate, idx) => {
            const name = gate.name || gate.label || gate.id || `Corner ${idx + 1}`;
            let distVal = null;

            const gLat =
                Number.isFinite(gate.lat)
                    ? gate.lat
                    : Number.isFinite(gate.lat1) && Number.isFinite(gate.lat2)
                        ? (gate.lat1 + gate.lat2) / 2
                        : null;
            const gLon =
                Number.isFinite(gate.lon)
                    ? gate.lon
                    : Number.isFinite(gate.lon1) && Number.isFinite(gate.lon2)
                        ? (gate.lon1 + gate.lon2) / 2
                        : null;

            if (gLat != null && gLon != null) {
                distVal = nearestTrackDistance(gLat, gLon);

                if (distVal == null && gpsLat && gpsLon) {
                    let bestI = 0;
                    let bestM = Infinity;
                    const len = Math.min(gpsLat.length, gpsLon.length);
                    for (let i = 0; i < len; i++) {
                        if (!Number.isFinite(gpsLat[i]) || !Number.isFinite(gpsLon[i])) continue;
                        const m = haversineMeters(gLat, gLon, gpsLat[i], gpsLon[i]);
                        if (m < bestM) {
                            bestM = m;
                            bestI = i;
                        }
                    }
                    if (Number.isFinite(xAxisData?.[bestI])) {
                        distVal = xAxisData[bestI];
                    }
                }
            }

            if (distVal == null && Number.isFinite(gate.distance)) {
                distVal = gate.distance;
            }

            if (distVal == null && Number.isFinite(gate.time)) {
                distVal = distanceAtTime(gate.time);
            }

            if (Number.isFinite(distVal)) {
                markers.push({
                    name,
                    xAxis: Number(distVal.toFixed(1))
                });
            }
        });
    }

    return markers;
};

function SingleSyncedPane({
    channelKey,
    label,
    unit,
    xAxisData,
    values,
    xAxisMode,
    anomalies,
    cornerMarkers,
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

    const markLineConfig = useMemo(() => {
        if (xAxisMode !== "distance" || !cornerMarkers?.length) return undefined;
        return {
            silent: true,
            symbol: ["none", "none"],
            label: {
                show: true,
                position: "insideStartTop",
                formatter: "{b}",
                color: "#e2e8f0",
                backgroundColor: "rgba(30, 41, 59, 0.85)",
                borderColor: "#475569",
                borderWidth: 1,
                borderRadius: 3,
                padding: [1, 4],
                fontSize: 10
            },
            lineStyle: {
                color: "rgba(251, 191, 36, 0.55)",
                type: "dashed",
                width: 1
            },
            data: cornerMarkers.map((m) => ({
                name: m.name,
                xAxis: m.xAxis
            }))
        };
    }, [xAxisMode, cornerMarkers]);

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
                    const nearbyCorners =
                        xAxisMode === "distance" && cornerMarkers?.length
                            ? cornerMarkers
                                  .filter((c) => Math.abs(c.xAxis - Number(xVal)) <= 12)
                                  .map((c) => c.name)
                            : [];
                    const cornerLine = nearbyCorners.length
                        ? `<div style="color:#fbbf24;font-size:11px;margin-top:2px">Corner: ${nearbyCorners.join(", ")}</div>`
                        : "";
                    return `<div style="font-family:monospace">
                        <div style="color:#94a3b8;margin-bottom:2px">${xFormatted}</div>
                        <span style="color:${color}">●</span> <b>${label}</b>: ${yVal} ${unit || ""}
                        ${cornerLine}
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
                    markArea: markAreas.length ? { silent: true, data: markAreas } : undefined,
                    markLine: markLineConfig
                }
            ]
        };
    }, [seriesPairs, xAxisMode, color, label, unit, isLast, markAreas, markLineConfig, cornerMarkers]);

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
    geoData,
    gatesData,
    xAxisMode,
    onRegionSelect
}) {
    const gpsDistanceM = useMemo(() => {
        const lat = allChannels?.GPS_Latitude || allChannels?.gps_lat || allChannels?.latitude;
        const lon = allChannels?.GPS_Longitude || allChannels?.gps_lon || allChannels?.longitude;
        return buildDistanceFromGps(lat, lon);
    }, [allChannels]);

    const xAxisData = useMemo(() => {
        if (xAxisMode !== "distance") return timeMs;
        if (distanceM?.length) return distanceM;
        if (gpsDistanceM?.length) return gpsDistanceM;
        return timeMs;
    }, [xAxisMode, distanceM, gpsDistanceM, timeMs]);

    const cornerMarkers = useMemo(() => {
        if (xAxisMode !== "distance") return [];
        return computeCornerDistanceMarkers({
            gatesData,
            geoData,
            allChannels,
            timeMs,
            xAxisData
        });
    }, [xAxisMode, gatesData, geoData, allChannels, timeMs, xAxisData]);

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
                        cornerMarkers={cornerMarkers}
                        color={TRACE_COLORS[idx % TRACE_COLORS.length]}
                        isLast={idx === selectedChannels.length - 1}
                        onRegionSelect={onRegionSelect}
                    />
                );
            })}
        </div>
    );
}