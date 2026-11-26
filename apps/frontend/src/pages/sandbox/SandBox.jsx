import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../services/api";
import TimestampSelect from "../MQTT/Components/TimestampSelect";

import {
    SANDBOX_STORAGE_KEYS,
    buildTypedTelemetryStore,
    buildDerivedLabel,
    parseRawCanHexLog,
    evaluateChartAvailability,
    loadSavedRecipes,
    saveRecipesToStorage
} from "./store/sandboxStore";
import { BUNDLED_PRESETS, generatePresetDataset } from "./presets/trainingData";
import { useDspWorker } from "./hooks/useDspWorker";
import { computeRegionStats } from "./dsp/mathEngine";
import { computeVirtualTps } from "./dsp/virtualTps";

import MultiTraceChart from "./charts/MultiTraceChart";
import SandboxGGChart from "./charts/SandboxGGChart";
import SandboxTrackMap from "./charts/SandboxTrackMap";
import {
    FFTChart,
    DamperHistogramChart,
    CustomXYChart,
    LapOverlayChart
} from "./charts/AnalysisCharts";
import FilterWorkbench from "./components/FilterWorkbench";
import { MissionsPanel } from "./components/SandboxPanels";

const readBlobAsText = (blob) =>
    new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsText(blob);
    });

const isValidCoord = (lat, lon) =>
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    Math.abs(lat) > 0.001 &&
    Math.abs(lon) > 0.001 &&
    Math.abs(lat) <= 90 &&
    Math.abs(lon) <= 180;

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

const getRowLatLon = (row) => {
    if (!row || typeof row !== "object") return { lat: NaN, lon: NaN };
    const lat = Number(
        row.GPS_Latitude ?? row.gps_lat ?? row.Latitude ?? row.latitude ?? row.lat
    );
    const lon = Number(
        row.GPS_Longitude ?? row.gps_lon ?? row.Longitude ?? row.longitude ?? row.lon ?? row.lng
    );
    return { lat, lon };
};

const getRowTimeMs = (row, fallbackIdx) => {
    if (!row || typeof row !== "object") return fallbackIdx * 20;
    const raw = row.ts ?? row.timestamp ?? row.timeMs ?? row.time ?? row.Time;
    const num = Number(raw);
    if (!Number.isFinite(num)) return fallbackIdx * 20;
    return num < 1e10 && num > 0 && String(raw).includes(".") ? num * 1000 : num;
};

const setRowLatLon = (row, lat, lon) => {
    const next = { ...row };
    if ("GPS_Latitude" in next) next.GPS_Latitude = lat;
    if ("GPS_Longitude" in next) next.GPS_Longitude = lon;
    if ("gps_lat" in next) next.gps_lat = lat;
    if ("gps_lon" in next) next.gps_lon = lon;
    if ("Latitude" in next) next.Latitude = lat;
    if ("Longitude" in next) next.Longitude = lon;
    if ("latitude" in next) next.latitude = lat;
    if ("longitude" in next) next.longitude = lon;
    if ("lat" in next) next.lat = lat;
    if ("lon" in next) next.lon = lon;
    if ("lng" in next) next.lng = lon;
    if (!("GPS_Latitude" in next) && !("gps_lat" in next) && !("lat" in next) && !("latitude" in next)) {
        next.GPS_Latitude = lat;
        next.GPS_Longitude = lon;
    }
    return next;
};

const isPointInRing = (lon, lat, ring) => {
    if (!Array.isArray(ring) || ring.length < 3) return false;
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const xi = ring[i][0];
        const yi = ring[i][1];
        const xj = ring[j][0];
        const yj = ring[j][1];
        const intersect =
            yi > lat !== yj > lat &&
            lon < ((xj - xi) * (lat - yi)) / (yj - yi + 1e-16) + xi;
        if (intersect) inside = !inside;
    }
    return inside;
};

const ringSignedArea = (ring) => {
    if (!Array.isArray(ring) || ring.length < 3) return 0;
    let area = 0;
    for (let i = 0; i < ring.length; i++) {
        const [x1, y1] = ring[i];
        const [x2, y2] = ring[(i + 1) % ring.length];
        area += x1 * y2 - x2 * y1;
    }
    return Math.abs(area) / 2;
};

const extractTrackGeometry = (geoData) => {
    if (!geoData) return { outerRing: null, innerRing: null, centerline: [] };
    const features = Array.isArray(geoData.features)
        ? geoData.features
        : geoData.geometry
            ? [geoData]
            : [];

    const rings = [];
    features.forEach((feat) => {
        const g = feat?.geometry || feat;
        if (!g) return;
        if (g.type === "Polygon" && Array.isArray(g.coordinates)) {
            if (g.coordinates[0]?.length) rings.push(g.coordinates[0]);
            if (g.coordinates[1]?.length) rings.push(g.coordinates[1]);
        } else if (g.type === "MultiPolygon" && Array.isArray(g.coordinates)) {
            g.coordinates.forEach((poly) => {
                if (poly[0]?.length) rings.push(poly[0]);
                if (poly[1]?.length) rings.push(poly[1]);
            });
        } else if (g.type === "LineString" && Array.isArray(g.coordinates)) {
            rings.push(g.coordinates);
        } else if (g.type === "MultiLineString" && Array.isArray(g.coordinates)) {
            g.coordinates.forEach((line) => {
                if (line?.length) rings.push(line);
            });
        }
    });

    if (rings.length === 0) return { outerRing: null, innerRing: null, centerline: [] };
    if (rings.length === 1) {
        return { outerRing: rings[0], innerRing: null, centerline: rings[0] };
    }

    const sorted = [...rings].sort((a, b) => ringSignedArea(b) - ringSignedArea(a));
    const outerRing = sorted[0];
    const innerRing = sorted[1];
    const len = Math.min(outerRing.length, innerRing.length);
    const centerline = [];
    for (let i = 0; i < len; i++) {
        centerline.push([
            (outerRing[i][0] + innerRing[i][0]) / 2,
            (outerRing[i][1] + innerRing[i][1]) / 2
        ]);
    }
    return { outerRing, innerRing, centerline };
};

const closestPointOnPolyline = (lon, lat, polyline) => {
    if (!Array.isArray(polyline) || polyline.length === 0) {
        return { lon, lat, distMeters: Infinity };
    }
    if (polyline.length === 1) {
        const p = polyline[0];
        return {
            lon: p[0],
            lat: p[1],
            distMeters: haversineMeters(lat, lon, p[1], p[0])
        };
    }

    const cosLat = Math.cos((lat * Math.PI) / 180);
    let bestLon = polyline[0][0];
    let bestLat = polyline[0][1];
    let bestSq = Infinity;

    for (let i = 0; i < polyline.length - 1; i++) {
        const ax = polyline[i][0] * cosLat;
        const ay = polyline[i][1];
        const bx = polyline[i + 1][0] * cosLat;
        const by = polyline[i + 1][1];
        const px = lon * cosLat;
        const py = lat;

        const abx = bx - ax;
        const aby = by - ay;
        const abLenSq = abx * abx + aby * aby;
        const t =
            abLenSq > 0
                ? Math.max(0, Math.min(1, ((px - ax) * abx + (py - ay) * aby) / abLenSq))
                : 0;

        const projLon = polyline[i][0] + t * (polyline[i + 1][0] - polyline[i][0]);
        const projLat = polyline[i][1] + t * (polyline[i + 1][1] - polyline[i][1]);
        const dx = (projLon - lon) * cosLat;
        const dy = projLat - lat;
        const dSq = dx * dx + dy * dy;

        if (dSq < bestSq) {
            bestSq = dSq;
            bestLon = projLon;
            bestLat = projLat;
        }
    }

    return {
        lon: bestLon,
        lat: bestLat,
        distMeters: haversineMeters(lat, lon, bestLat, bestLon)
    };
};

const smoothGpsSeries = (points) => {
    const n = points.length;
    if (n < 3) return points.map((p) => ({ ...p }));
    const out = new Array(n);
    out[0] = { ...points[0] };
    out[n - 1] = { ...points[n - 1] };

    for (let i = 1; i < n - 1; i++) {
        const prev = points[i - 1];
        const curr = points[i];
        const next = points[i + 1];
        if (!curr.valid) {
            out[i] = { ...curr };
            continue;
        }
        if (
            prev.valid &&
            next.valid &&
            haversineMeters(prev.lat, prev.lon, curr.lat, curr.lon) < 50 &&
            haversineMeters(curr.lat, curr.lon, next.lat, next.lon) < 50
        ) {
            out[i] = {
                ...curr,
                lat: 0.25 * prev.lat + 0.5 * curr.lat + 0.25 * next.lat,
                lon: 0.25 * prev.lon + 0.5 * curr.lon + 0.25 * next.lon
            };
        } else {
            out[i] = { ...curr };
        }
    }
    return out;
};

const alignGpsSeriesToTrack = (points, geoData) => {
    const { outerRing, innerRing, centerline } = extractTrackGeometry(geoData);
    if (!centerline.length) return points;

    const dLats = [];
    const dLons = [];
    for (let i = 0; i < points.length; i++) {
        const p = points[i];
        if (!p.valid) continue;
        const nearest = closestPointOnPolyline(p.lon, p.lat, centerline);
        if (nearest.distMeters < 25) {
            dLats.push(nearest.lat - p.lat);
            dLons.push(nearest.lon - p.lon);
        }
    }

    let medDLat = 0;
    let medDLon = 0;
    if (dLats.length >= 10) {
        dLats.sort((a, b) => a - b);
        dLons.sort((a, b) => a - b);
        const mid = Math.floor(dLats.length / 2);
        medDLat = dLats[mid];
        medDLon = dLons[mid];
    }

    return points.map((p) => {
        if (!p.valid) return p;
        let lat = p.lat + medDLat;
        let lon = p.lon + medDLon;

        if (outerRing && innerRing) {
            const insideOuter = isPointInRing(lon, lat, outerRing);
            const insideInner = isPointInRing(lon, lat, innerRing);
            if (!insideOuter || insideInner) {
                const targetRing = !insideOuter ? outerRing : innerRing;
                const clamped = closestPointOnPolyline(lon, lat, targetRing);
                if (clamped.distMeters < 30) {
                    lat = clamped.lat;
                    lon = clamped.lon;
                }
            }
        } else if (outerRing && outerRing.length >= 4) {
            const first = outerRing[0];
            const last = outerRing[outerRing.length - 1];
            const isClosed =
                Math.abs(first[0] - last[0]) < 1e-6 && Math.abs(first[1] - last[1]) < 1e-6;
            if (isClosed && !isPointInRing(lon, lat, outerRing)) {
                const clamped = closestPointOnPolyline(lon, lat, outerRing);
                if (clamped.distMeters < 30) {
                    lat = clamped.lat;
                    lon = clamped.lon;
                }
            }
        }

        return { ...p, lat, lon };
    });
};

const normalizeGatesList = (gatesJson) => {
    if (!gatesJson) return [];
    const list = [];

    const pushGate = (name, g) => {
        if (!g || !name) return;
        if (
            Number.isFinite(g.lat1) &&
            Number.isFinite(g.lon1) &&
            Number.isFinite(g.lat2) &&
            Number.isFinite(g.lon2)
        ) {
            list.push({
                name: String(name),
                p1: { lat: Number(g.lat1), lon: Number(g.lon1) },
                p2: { lat: Number(g.lat2), lon: Number(g.lon2) },
                isPointOnly: false
            });
            return;
        }
        const coords = g.geometry?.coordinates || g.coordinates;
        if (Array.isArray(coords) && coords.length >= 2 && Array.isArray(coords[0])) {
            list.push({
                name: String(name),
                p1: { lat: Number(coords[0][1]), lon: Number(coords[0][0]) },
                p2: { lat: Number(coords[1][1]), lon: Number(coords[1][0]) },
                isPointOnly: false
            });
            return;
        }
        if (g.p1 && g.p2) {
            list.push({
                name: String(name),
                p1: { lat: Number(g.p1.lat), lon: Number(g.p1.lon) },
                p2: { lat: Number(g.p2.lat), lon: Number(g.p2.lon) },
                isPointOnly: false
            });
            return;
        }
        const lat = Number(g.lat ?? g.latitude ?? (Array.isArray(coords) ? coords[1] : NaN));
        const lon = Number(g.lon ?? g.longitude ?? (Array.isArray(coords) ? coords[0] : NaN));
        if (Number.isFinite(lat) && Number.isFinite(lon)) {
            list.push({
                name: String(name),
                p1: { lat, lon },
                p2: { lat, lon },
                isPointOnly: true
            });
        }
    };

    if (Array.isArray(gatesJson.features)) {
        gatesJson.features.forEach((f, idx) => {
            const name =
                f.properties?.name ||
                f.properties?.label ||
                f.properties?.gate ||
                f.properties?.id ||
                `Gate_${idx + 1}`;
            pushGate(name, f);
        });
    } else if (Array.isArray(gatesJson)) {
        gatesJson.forEach((g, idx) => {
            const name = g.name || g.label || g.gate || g.id || `Gate_${idx + 1}`;
            pushGate(name, g);
        });
    } else if (typeof gatesJson === "object") {
        Object.entries(gatesJson).forEach(([key, val]) => {
            if (val && typeof val === "object") {
                pushGate(val.name || val.label || key, val);
            }
        });
    }

    return list;
};

const segmentIntersectionAlpha = (ax, ay, bx, by, cx, cy, dx, dy) => {
    const rX = bx - ax;
    const rY = by - ay;
    const sX = dx - cx;
    const sY = dy - cy;
    const denom = rX * sY - rY * sX;
    if (Math.abs(denom) < 1e-14) return null;
    const qpX = cx - ax;
    const qpY = cy - ay;
    const t = (qpX * sY - qpY * sX) / denom;
    const u = (qpX * rY - qpY * rX) / denom;
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) return t;
    return null;
};

const pointToGateMeters = (lat, lon, gate) => {
    if (gate.isPointOnly) {
        return haversineMeters(lat, lon, gate.p1.lat, gate.p1.lon);
    }
    return closestPointOnPolyline(lon, lat, [
        [gate.p1.lon, gate.p1.lat],
        [gate.p2.lon, gate.p2.lat]
    ]).distMeters;
};

const detectGateCrossings = (points, gatesJson, toleranceMeters = 12.0) => {
    const gates = normalizeGatesList(gatesJson);
    if (!gates.length || points.length < 2) return [];

    const crossings = [];
    const cooldownMs = 2500;

    gates.forEach((gate) => {
        let lastCrossTime = -Infinity;
        let inTolWindow = false;
        let bestWindowDist = Infinity;
        let bestWindowTime = null;

        for (let i = 1; i < points.length; i++) {
            const p0 = points[i - 1];
            const p1 = points[i];
            if (!p0.valid || !p1.valid) continue;

            if (!gate.isPointOnly) {
                const alpha = segmentIntersectionAlpha(
                    p0.lon,
                    p0.lat,
                    p1.lon,
                    p1.lat,
                    gate.p1.lon,
                    gate.p1.lat,
                    gate.p2.lon,
                    gate.p2.lat
                );
                if (alpha !== null) {
                    const tCross = p0.time + alpha * (p1.time - p0.time);
                    if (tCross - lastCrossTime >= cooldownMs) {
                        crossings.push({ gate: gate.name, time: tCross });
                        lastCrossTime = tCross;
                        inTolWindow = false;
                        bestWindowDist = Infinity;
                        bestWindowTime = null;
                        continue;
                    }
                }
            }

            const d = pointToGateMeters(p1.lat, p1.lon, gate);
            if (d <= toleranceMeters) {
                inTolWindow = true;
                if (d < bestWindowDist) {
                    bestWindowDist = d;
                    bestWindowTime = p1.time;
                }
            } else if (inTolWindow) {
                if (bestWindowTime !== null && bestWindowTime - lastCrossTime >= cooldownMs) {
                    crossings.push({ gate: gate.name, time: bestWindowTime });
                    lastCrossTime = bestWindowTime;
                }
                inTolWindow = false;
                bestWindowDist = Infinity;
                bestWindowTime = null;
            }
        }

        if (inTolWindow && bestWindowTime !== null && bestWindowTime - lastCrossTime >= cooldownMs) {
            crossings.push({ gate: gate.name, time: bestWindowTime });
        }
    });

    crossings.sort((a, b) => a.time - b.time);
    return crossings;
};

const buildGatesTimesFromCrossings = (crossings, gatesJson, existingGatesTimes) => {
    const existingLaps = Array.isArray(existingGatesTimes?.lap_data)
        ? existingGatesTimes.lap_data
        : [];
    if (!crossings.length) return existingGatesTimes || null;

    const gatesList = normalizeGatesList(gatesJson);
    const sfCandidate =
        gatesList.find((g) => /^(s0|sf|start|finish|start_finish)$/i.test(g.name.trim()))?.name ||
        crossings.find((c) => /^(s0|sf|start|finish|start_finish)$/i.test(c.gate.trim()))?.gate ||
        gatesList[0]?.name;

    if (!sfCandidate) return existingGatesTimes || null;

    const sfCrossings = crossings.filter((c) => c.gate === sfCandidate);
    if (sfCrossings.length < 2) return existingGatesTimes || null;

    const lapData = [];
    for (let k = 0; k < sfCrossings.length - 1; k++) {
        const lapStart = sfCrossings[k].time;
        const lapEnd = sfCrossings[k + 1].time;
        const lapTime = lapEnd - lapStart;
        if (lapTime < 5000) continue;

        const inLap = crossings.filter((c) => c.time > lapStart && c.time < lapEnd);
        const s1Hit = inLap.find((c) => /^s1$/i.test(c.gate.trim()));
        const s2Hit = inLap.find((c) => /^s2$/i.test(c.gate.trim()));

        const s1Time = s1Hit ? s1Hit.time - lapStart : null;
        const s2Time = s1Hit && s2Hit ? s2Hit.time - s1Hit.time : null;
        const s3Time = s2Hit ? lapEnd - s2Hit.time : s1Hit ? lapEnd - s1Hit.time : null;

        const lapObj = {
            ...(existingLaps[lapData.length] || {}),
            S0: lapStart,
            S1: s1Hit ? s1Hit.time : existingLaps[lapData.length]?.S1 ?? null,
            S2: s2Hit ? s2Hit.time : existingLaps[lapData.length]?.S2 ?? null,
            S3: lapEnd,
            ts: lapEnd,
            lap_time: lapTime,
            S1_time: s1Time,
            S2_time: s2Time,
            S3_time: s3Time,
            sector1: s1Time,
            sector2: s2Time,
            sector3: s3Time
        };

        inLap.forEach((c) => {
            const gName = c.gate.trim();
            if (!gName.toUpperCase().startsWith("T")) return;
            if (/ IN$/i.test(gName)) {
                if (lapObj[gName] == null) lapObj[gName] = c.time;
            } else if (/ OUT$/i.test(gName)) {
                lapObj[gName] = c.time;
            } else {
                lapObj[gName] = c.time;
                if (lapObj[`${gName} IN`] == null) {
                    lapObj[`${gName} IN`] = Math.max(lapStart, c.time - 1500);
                }
                lapObj[`${gName} OUT`] = Math.min(lapEnd, c.time + 1500);
            }
        });

        lapData.push(lapObj);
    }

    if (lapData.length === 0) return existingGatesTimes || null;
    if (lapData.length < existingLaps.length) return existingGatesTimes;

    return {
        ...(existingGatesTimes || {}),
        lap_data: lapData
    };
};

const formatStatValue = (val) => {
    if (!Number.isFinite(val)) return "—";
    if (Math.abs(val) >= 100) return val.toFixed(1);
    if (Math.abs(val) >= 10) return val.toFixed(2);
    return val.toFixed(3);
};

const escapeCsvCell = (val) => {
    if (val === null || val === undefined || (typeof val === "number" && !Number.isFinite(val))) {
        return "";
    }
    const str = String(val);
    if (/[",\r\n]/.test(str)) {
        return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
};

export default function SandBox() {
    const navigate = useNavigate();
    const { runTask } = useDspWorker();
    const rawCanInputRef = useRef(null);

    const [sandboxSessions, setSandboxSessions] = useState([]);
    const [selectedSourceId, setSelectedSourceId] = useState(
        () => localStorage.getItem(SANDBOX_STORAGE_KEYS.SESSION_ID) || "preset:clean_lap"
    );
    const [activeTab, setActiveTab] = useState(
        () => localStorage.getItem(SANDBOX_STORAGE_KEYS.ACTIVE_TAB) || "charts"
    );
    const [xAxisMode, setXAxisMode] = useState(
        () => localStorage.getItem(SANDBOX_STORAGE_KEYS.X_AXIS_MODE) || "time"
    );

    const [rawFileData, setRawFileData] = useState(null);
    const [geoData, setGeoData] = useState(null);
    const [gatesJson, setGatesJson] = useState(null);
    const [loading, setLoading] = useState(false);
    const [statusMsg, setStatusMsg] = useState("");

    const [selectedTs, setSelectedTs] = useState(null);
    const [selectedLap, setSelectedLap] = useState(null);
    const [selectedTurn, setSelectedTurn] = useState(null);

    const [recipes, setRecipes] = useState(() => loadSavedRecipes());
    const [derivedChannels, setDerivedChannels] = useState({});
    const [residuals, setResiduals] = useState({});

    const [selectedTraceKeys, setSelectedTraceKeys] = useState([
        "GPS_Speed",
        "Acceleration_on_X_axis",
        "Acceleration_on_Y_axis"
    ]);
    const [activeAnalysisView, setActiveAnalysisView] = useState("multi_trace");
    const [regionSelection, setRegionSelection] = useState(null);

    const [isExportModalOpen, setIsExportModalOpen] = useState(false);
    const [exportSelectedKeys, setExportSelectedKeys] = useState([]);
    const [exportFormat, setExportFormat] = useState("csv");

    useEffect(() => {
        api.getSessions(true)
            .then((list) => {
                const flagged = Array.isArray(list)
                    ? list.filter((s) => Number(s.is_sandbox) === 1 || s.is_sandbox === true)
                    : [];
                setSandboxSessions(flagged);
            })
            .catch(() => setSandboxSessions([]));
    }, []);

    useEffect(() => {
        localStorage.setItem(SANDBOX_STORAGE_KEYS.SESSION_ID, selectedSourceId);
    }, [selectedSourceId]);

    useEffect(() => {
        localStorage.setItem(SANDBOX_STORAGE_KEYS.ACTIVE_TAB, activeTab);
    }, [activeTab]);

    useEffect(() => {
        localStorage.setItem(SANDBOX_STORAGE_KEYS.X_AXIS_MODE, xAxisMode);
    }, [xAxisMode]);

    useEffect(() => {
        saveRecipesToStorage(recipes);
    }, [recipes]);

    useEffect(() => {
        if (!selectedSourceId) return;
        setSelectedTs(null);
        setSelectedLap(null);
        setSelectedTurn(null);
        setRegionSelection(null);
        setIsExportModalOpen(false);

        if (selectedSourceId.startsWith("preset:")) {
            const presetId = selectedSourceId.replace("preset:", "");
            const data = generatePresetDataset(presetId);
            setRawFileData(data);
            setGeoData(null);
            setGatesJson(null);
            setStatusMsg(`Loaded bundled training dataset (${data.rows.length} samples).`);
            return;
        }

        if (selectedSourceId.startsWith("rawcan:")) {
            return;
        }

        const sessionObj = sandboxSessions.find((s) => String(s.id) === String(selectedSourceId));
        if (!sessionObj) return;

        let cancelled = false;
        const loadR2Session = async () => {
            setLoading(true);
            setStatusMsg("Downloading telemetry file from R2...");
            try {
                const fileBlob = await api.downloadFile(sessionObj.decodedFileName || sessionObj.filePath);
                const text = await readBlobAsText(fileBlob);
                const parsed = JSON.parse(text);

                if (sessionObj.trackId) {
                    try {
                        const track = await api.getTrackById(sessionObj.trackId);
                        const [gBlob, cBlob] = await Promise.all([
                            api.downloadFile(track.gates),
                            api.downloadFile(track.coordinates)
                        ]);
                        if (!cancelled) {
                            setGatesJson(JSON.parse(await readBlobAsText(gBlob)));
                            setGeoData(JSON.parse(await readBlobAsText(cBlob)));
                        }
                    } catch {
                        if (!cancelled) {
                            setGatesJson(null);
                            setGeoData(null);
                        }
                    }
                } else if (!cancelled) {
                    setGatesJson(null);
                    setGeoData(null);
                }

                if (!cancelled) {
                    setRawFileData(parsed);
                    setStatusMsg(`Loaded R2 session "${sessionObj.name || sessionObj.id}".`);
                }
            } catch (err) {
                if (!cancelled) setStatusMsg(`Failed to load session: ${err.message}`);
            } finally {
                if (!cancelled) setLoading(false);
            }
        };

        loadR2Session();
        return () => {
            cancelled = true;
        };
    }, [selectedSourceId, sandboxSessions]);

    const handleRawCanFileUpload = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setLoading(true);
        setStatusMsg(`Decoding raw CAN hex log "${file.name}" via CANDecoderV2...`);
        try {
            const text = await file.text();
            const decoded = await parseRawCanHexLog(text, gatesJson ? { gates: gatesJson } : null);
            setRawFileData(decoded);
            setSelectedSourceId(`rawcan:${file.name}`);
            setStatusMsg(`Decoded ${decoded.rows.length} CAN frames from ${file.name}.`);
        } catch (err) {
            setStatusMsg(`CAN decode failed: ${err.message}`);
        } finally {
            setLoading(false);
        }
    };

    const effectiveFileData = useMemo(() => {
        if (!rawFileData) return null;
        const rows = Array.isArray(rawFileData.rows) ? rawFileData.rows : null;
        if (!rows || rows.length === 0) return rawFileData;

        const rawGps = rows.map((row, idx) => {
            const { lat, lon } = getRowLatLon(row);
            return {
                lat,
                lon,
                time: getRowTimeMs(row, idx),
                valid: isValidCoord(lat, lon)
            };
        });

        const hasGps = rawGps.some((p) => p.valid);
        if (!hasGps) return rawFileData;

        const smoothed = smoothGpsSeries(rawGps);
        const aligned = geoData ? alignGpsSeriesToTrack(smoothed, geoData) : smoothed;

        const updatedRows = rows.map((row, idx) => {
            const pt = aligned[idx];
            if (!pt || !pt.valid) return row;
            return setRowLatLon(row, pt.lat, pt.lon);
        });

        let updatedGatesTimes = rawFileData.Gates_times || null;
        if (gatesJson) {
            const crossings = detectGateCrossings(aligned, gatesJson, 12.0);
            updatedGatesTimes = buildGatesTimesFromCrossings(
                crossings,
                gatesJson,
                rawFileData.Gates_times
            );
        }

        return {
            ...rawFileData,
            rows: updatedRows,
            Gates_times: updatedGatesTimes
        };
    }, [rawFileData, geoData, gatesJson]);

    const availableLaps = useMemo(() => {
        return effectiveFileData?.Gates_times?.lap_data || [];
    }, [effectiveFileData]);

    const availableTurns = useMemo(() => {
        const turns = new Set();
        availableLaps.forEach((lap) => {
            Object.keys(lap).forEach((k) => {
                if (k.startsWith("T")) {
                    turns.add(k.replace(/ IN$/, "").replace(/ OUT$/, ""));
                }
            });
        });
        return Array.from(turns);
    }, [availableLaps]);

    const activeTimeWindow = useMemo(() => {
        if (selectedTurn && availableLaps.length > 0) {
            const lap = selectedLap !== null ? availableLaps[selectedLap] : availableLaps[0];
            if (lap) {
                const tIn = lap[`${selectedTurn} IN`] || lap[selectedTurn];
                const tOut = lap[`${selectedTurn} OUT`] || (tIn ? tIn + 3000 : null);
                if (tIn && tOut) return { min: Math.min(tIn, tOut), max: Math.max(tIn, tOut) };
            }
        }
        if (selectedLap !== null && availableLaps[selectedLap]) {
            const lap = availableLaps[selectedLap];
            return {
                min: Number(lap.S0),
                max: Number(lap.S3 || lap.ts)
            };
        }
        if (selectedTs) {
            return {
                min: Number(selectedTs.startTime),
                max: Number(selectedTs.endTime)
            };
        }
        return null;
    }, [selectedTurn, selectedLap, selectedTs, availableLaps]);

    const baseStore = useMemo(() => {
        return buildTypedTelemetryStore(effectiveFileData, activeTimeWindow);
    }, [effectiveFileData, activeTimeWindow]);

    useEffect(() => {
        let cancelled = false;
        const recomputeRecipes = async () => {
            const nextDerived = {};
            const nextResiduals = {};

            for (const r of recipes) {
                const src = baseStore.rawChannels[r.sourceKey];
                if (!src || src.length === 0) continue;

                try {
                    if (r.kind === "TARE") {
                        const res = await runTask("TARE", {
                            values: src,
                            speedKmh: baseStore.rawChannels.GPS_Speed || null,
                            timeMs: baseStore.timeMs
                        });
                        nextDerived[r.outputKey] = res.values;
                        nextResiduals[r.outputKey] = new Float64Array(src.length).fill(res.offset);
                    } else if (r.kind === "DERIVATIVE") {
                        const res = await runTask("DERIVATIVE", {
                            timeMs: baseStore.timeMs,
                            values: src,
                            scaleFactor: 10
                        });
                        nextDerived[r.outputKey] = res;
                    } else if (r.kind === "MATLAB") {
                        const res = await runTask("MATLAB", {
                            expression: r.expression,
                            sourceArray: src,
                            allChannelsMap: { ...baseStore.rawChannels, ...nextDerived }
                        });
                        nextDerived[r.outputKey] = res;
                    } else {
                        const res = await runTask("FILTER", {
                            filterType: r.filterType,
                            values: src,
                            timeMs: baseStore.timeMs,
                            fs: baseStore.fs,
                            params: r.params
                        });
                        nextDerived[r.outputKey] = res.filtered;
                        nextResiduals[r.outputKey] = res.residual;
                    }
                } catch {
                    continue;
                }
            }

            if (!cancelled) {
                setDerivedChannels(nextDerived);
                setResiduals(nextResiduals);
            }
        };

        recomputeRecipes();
        return () => {
            cancelled = true;
        };
    }, [baseStore, recipes, runTask]);

    const virtualTpsChannel = useMemo(() => {
        return computeVirtualTps({
            rawChannels: baseStore.rawChannels,
            derivedChannels,
            timeMs: baseStore.timeMs,
            fs: baseStore.fs
        });
    }, [baseStore, derivedChannels]);

    const allChannels = useMemo(() => {
        const merged = { ...baseStore.rawChannels, ...derivedChannels };
        if (virtualTpsChannel) {
            merged.Virtual_TPS = virtualTpsChannel;
        }
        return merged;
    }, [baseStore.rawChannels, derivedChannels, virtualTpsChannel]);

    const allLabels = useMemo(() => {
        const merged = { ...baseStore.labels };
        recipes.forEach((r) => {
            merged[r.outputKey] = buildDerivedLabel(r, baseStore.labels);
        });
        if (virtualTpsChannel) {
            merged.Virtual_TPS = "Virtual TPS";
        }
        return merged;
    }, [baseStore.labels, recipes, virtualTpsChannel]);

    const allUnits = useMemo(() => {
        const merged = { ...baseStore.units };
        if (virtualTpsChannel) {
            merged.Virtual_TPS = "%";
        }
        return merged;
    }, [baseStore.units, virtualTpsChannel]);

    const activeChartChannelKeys = useMemo(() => {
        return selectedTraceKeys.filter((k) => Boolean(allChannels[k]));
    }, [selectedTraceKeys, allChannels]);

    const chartAvailability = useMemo(() => {
        return evaluateChartAvailability(allChannels, baseStore.gatesData);
    }, [allChannels, baseStore.gatesData]);

    const multiRegionStats = useMemo(() => {
        if (!regionSelection) return null;

        const keysToMeasure =
            selectedTraceKeys.length > 0
                ? selectedTraceKeys
                : regionSelection.channelKey
                    ? [regionSelection.channelKey]
                    : [];

        const orderedKeys =
            regionSelection.channelKey && keysToMeasure.includes(regionSelection.channelKey)
                ? [
                      regionSelection.channelKey,
                      ...keysToMeasure.filter((k) => k !== regionSelection.channelKey)
                  ]
                : keysToMeasure;

        const rows = [];
        for (const key of orderedKeys) {
            const values = allChannels[key];
            if (!values || values.length === 0) continue;
            const stats = computeRegionStats(
                baseStore.timeMs,
                allChannels.Distance,
                values,
                regionSelection.startX,
                regionSelection.endX,
                xAxisMode
            );
            if (stats) {
                rows.push({
                    key,
                    label: allLabels[key] || key,
                    unit: allUnits[key] || "",
                    isDerived: key === "Virtual_TPS" || Boolean(derivedChannels[key]),
                    stats
                });
            }
        }

        if (rows.length === 0) return null;

        return {
            primary: rows[0].stats,
            channels: rows
        };
    }, [
        regionSelection,
        selectedTraceKeys,
        allChannels,
        allLabels,
        allUnits,
        derivedChannels,
        baseStore.timeMs,
        xAxisMode
    ]);

    const windowSliceIndices = useMemo(() => {
        if (!regionSelection) return [];
        const minX = Math.min(regionSelection.startX, regionSelection.endX);
        const maxX = Math.max(regionSelection.startX, regionSelection.endX);
        const useDist = xAxisMode === "distance" && allChannels.Distance?.length;
        const axisArr = useDist ? allChannels.Distance : baseStore.timeMs;
        if (!axisArr || axisArr.length === 0) return [];

        const indices = [];
        for (let i = 0; i < axisArr.length; i++) {
            const xVal = axisArr[i];
            if (Number.isFinite(xVal) && xVal >= minX && xVal <= maxX) {
                indices.push(i);
            }
        }
        return indices;
    }, [regionSelection, xAxisMode, allChannels.Distance, baseStore.timeMs]);

    const openExportModal = useCallback(() => {
        setExportSelectedKeys([...activeChartChannelKeys]);
        setIsExportModalOpen(true);
    }, [activeChartChannelKeys]);

    const toggleExportKey = (key) => {
        if (!activeChartChannelKeys.includes(key)) return;
        setExportSelectedKeys((prev) =>
            prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
        );
    };

    const handleExportWindowData = useCallback(() => {
        const validKeys = exportSelectedKeys.filter((k) => activeChartChannelKeys.includes(k));
        if (!regionSelection || windowSliceIndices.length === 0 || validKeys.length === 0) {
            return;
        }

        const timeArr = baseStore.timeMs || [];
        const distArr = allChannels.Distance || [];
        const t0 = Number.isFinite(timeArr[windowSliceIndices[0]]) ? timeArr[windowSliceIndices[0]] : 0;

        const minX = Math.min(regionSelection.startX, regionSelection.endX);
        const maxX = Math.max(regionSelection.startX, regionSelection.endX);
        const rangeTag =
            xAxisMode === "distance"
                ? `${Math.round(minX)}m-${Math.round(maxX)}m`
                : `${Math.round(minX)}ms-${Math.round(maxX)}ms`;
        const baseFileName = `telemetry_window_${rangeTag}`;

        if (exportFormat === "json") {
            const samples = windowSliceIndices.map((idx) => {
                const tMs = Number.isFinite(timeArr[idx]) ? timeArr[idx] : null;
                const row = {
                    time_ms: tMs,
                    rel_time_s: tMs !== null ? Number(((tMs - t0) / 1000).toFixed(4)) : null
                };
                if (distArr.length > idx && Number.isFinite(distArr[idx])) {
                    row.distance_m = Number(distArr[idx].toFixed(3));
                }
                for (const key of validKeys) {
                    const ch = allChannels[key];
                    const val = ch && idx < ch.length ? ch[idx] : null;
                    row[key] = Number.isFinite(val) ? Number(val.toFixed(6)) : null;
                }
                return row;
            });

            const payload = {
                source: selectedSourceId,
                xAxisMode,
                window: {
                    start: minX,
                    end: maxX,
                    sampleCount: samples.length
                },
                channels: validKeys.map((key) => ({
                    key,
                    label: allLabels[key] || key,
                    unit: allUnits[key] || ""
                })),
                samples
            };

            const blob = new Blob([JSON.stringify(payload, null, 2)], {
                type: "application/json;charset=utf-8;"
            });
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = `${baseFileName}.json`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        } else {
            const includeDist = distArr.length > 0;
            const headers = [
                "Time_ms",
                "Rel_Time_s",
                ...(includeDist ? ["Distance_m"] : []),
                ...validKeys.map((key) => {
                    const label = allLabels[key] || key;
                    const unit = allUnits[key];
                    return unit ? `${label} (${unit})` : label;
                })
            ];

            const lines = [headers.map(escapeCsvCell).join(",")];
            for (const idx of windowSliceIndices) {
                const tMs = Number.isFinite(timeArr[idx]) ? timeArr[idx] : "";
                const relSec = Number.isFinite(timeArr[idx]) ? ((timeArr[idx] - t0) / 1000).toFixed(4) : "";
                const rowCells = [tMs, relSec];
                if (includeDist) {
                    rowCells.push(Number.isFinite(distArr[idx]) ? distArr[idx].toFixed(3) : "");
                }
                for (const key of validKeys) {
                    const ch = allChannels[key];
                    const val = ch && idx < ch.length ? ch[idx] : NaN;
                    rowCells.push(Number.isFinite(val) ? val : "");
                }
                lines.push(rowCells.map(escapeCsvCell).join(","));
            }

            const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = `${baseFileName}.csv`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        }

        setIsExportModalOpen(false);
        setStatusMsg(
            `Exported ${windowSliceIndices.length} samples across ${validKeys.length} channels (${exportFormat.toUpperCase()}).`
        );
    }, [
        regionSelection,
        windowSliceIndices,
        exportSelectedKeys,
        activeChartChannelKeys,
        exportFormat,
        baseStore.timeMs,
        allChannels,
        allLabels,
        allUnits,
        xAxisMode,
        selectedSourceId
    ]);

    const handleAddRecipe = useCallback((recipe) => {
        setRecipes((prev) => [...prev, recipe]);
        setSelectedTraceKeys((prev) => (prev.includes(recipe.outputKey) ? prev : [...prev, recipe.outputKey]));
    }, []);

    const handleDeleteRecipe = useCallback((id) => {
        setRecipes((prev) => prev.filter((r) => r.id !== id));
    }, []);

    const handleCreateTareChannel = useCallback(
        (sourceKey) => {
            const outputKey = `${sourceKey}_TARED`;
            handleAddRecipe({ id: outputKey, kind: "TARE", outputKey, sourceKey });
        },
        [handleAddRecipe]
    );

    const handleCreateDerivativeChannel = useCallback(
        (sourceKey) => {
            const outputKey = `VEL_${sourceKey}`;
            handleAddRecipe({ id: outputKey, kind: "DERIVATIVE", outputKey, sourceKey });
        },
        [handleAddRecipe]
    );

    const handleCreateMatlabChannel = useCallback(
        async (outputKey, expression, sourceKey) => {
            const src = baseStore.rawChannels[sourceKey];
            await runTask("MATLAB", {
                expression,
                sourceArray: src,
                allChannelsMap: allChannels
            });
            handleAddRecipe({ id: outputKey, kind: "MATLAB", outputKey, sourceKey, expression });
        },
        [baseStore.rawChannels, allChannels, runTask, handleAddRecipe]
    );

    const toggleTraceChannel = (key) => {
        setSelectedTraceKeys((prev) => {
            const next = prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key];
            setExportSelectedKeys((expPrev) => expPrev.filter((k) => next.includes(k)));
            return next;
        });
    };

    const currentNumericSessionId =
        !selectedSourceId.startsWith("preset:") && !selectedSourceId.startsWith("rawcan:")
            ? selectedSourceId
            : null;

    const totalAnomalies = useMemo(() => {
        return Object.values(baseStore.anomalies || {}).reduce((acc, list) => acc + list.length, 0);
    }, [baseStore.anomalies]);

    return (
        <div className="min-h-screen bg-gray-950 text-gray-100 p-4 md:p-6 space-y-5">
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => navigate("/")}
                        className="px-3 py-1.5 rounded-md bg-gray-800 hover:bg-gray-700 text-xs text-gray-300 border border-gray-700"
                    >
                        ← Home
                    </button>
                    <div>
                        <h1 className="text-lg font-bold text-white tracking-tight">Telemetry DSP Sand Box</h1>
                        <p className="text-xs text-gray-400">{statusMsg || "Ready"}</p>
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                    <select
                        value={selectedSourceId}
                        onChange={(e) => setSelectedSourceId(e.target.value)}
                        className="bg-gray-800 border border-gray-700 rounded-md px-3 py-1.5 text-xs text-white max-w-xs"
                    >
                        <optgroup label="Bundled Training Presets">
                            {BUNDLED_PRESETS.map((p) => (
                                <option key={p.id} value={`preset:${p.id}`}>
                                    {p.name}
                                </option>
                            ))}
                        </optgroup>
                        <optgroup label="Curated Sandbox Sessions (R2)">
                            {sandboxSessions.map((s) => (
                                <option key={s.id} value={String(s.id)}>
                                    {s.name || `Session #${s.id}`} {s.notes ? `— ${s.notes}` : ""}
                                </option>
                            ))}
                        </optgroup>
                    </select>

                    <button
                        onClick={() => rawCanInputRef.current?.click()}
                        className="px-3 py-1.5 rounded-md bg-gray-800 hover:bg-gray-700 border border-gray-700 text-xs text-indigo-300"
                    >
                        Decode Raw CAN Hex (.txt/.log)
                    </button>
                    <input
                        ref={rawCanInputRef}
                        type="file"
                        accept=".txt,.log,.csv"
                        onChange={handleRawCanFileUpload}
                        className="hidden"
                    />

                    <div className="flex rounded-md overflow-hidden border border-gray-700 text-xs">
                        <button
                            onClick={() => setXAxisMode("time")}
                            className={`px-3 py-1.5 ${
                                xAxisMode === "time" ? "bg-indigo-600 text-white font-semibold" : "bg-gray-800 text-gray-300"
                            }`}
                        >
                            X: Time
                        </button>
                        <button
                            onClick={() => setXAxisMode("distance")}
                            disabled={!allChannels.Distance && !allChannels.GPS_Latitude}
                            className={`px-3 py-1.5 disabled:opacity-40 ${
                                xAxisMode === "distance"
                                    ? "bg-indigo-600 text-white font-semibold"
                                    : "bg-gray-800 text-gray-300"
                            }`}
                        >
                            X: Distance
                        </button>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 bg-gray-900/70 border border-gray-800 rounded-xl p-3">
                <div>
                    <label className="block text-xs text-gray-400 mb-1">Driver / Stint Slice</label>
                    {currentNumericSessionId ? (
                        <TimestampSelect
                            sessionId={currentNumericSessionId}
                            onSelect={(ts) => {
                                setSelectedTs(ts);
                                setSelectedLap(null);
                            }}
                        />
                    ) : (
                        <div className="text-xs text-gray-500 py-2 px-3 bg-gray-950/60 rounded border border-gray-800">
                            Full session active (select R2 multi-driver session for stints)
                        </div>
                    )}
                </div>

                <div>
                    <label className="block text-xs text-gray-400 mb-1">Lap Gate Slice</label>
                    <select
                        value={selectedLap ?? ""}
                        onChange={(e) => setSelectedLap(e.target.value === "" ? null : Number(e.target.value))}
                        className="w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-1.5 text-xs text-white"
                    >
                        <option value="">All Laps ({availableLaps.length} detected)</option>
                        {availableLaps.map((lap, idx) => (
                            <option key={idx} value={idx}>
                                Lap {idx + 1} {lap.lap_time ? `(${(lap.lap_time / 1000).toFixed(2)}s)` : ""}
                            </option>
                        ))}
                    </select>
                </div>

                <div>
                    <label className="block text-xs text-gray-400 mb-1">Corner / Turn Gate Slice</label>
                    <select
                        value={selectedTurn ?? ""}
                        onChange={(e) => setSelectedTurn(e.target.value === "" ? null : e.target.value)}
                        className="w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-1.5 text-xs text-white"
                    >
                        <option value="">All Corners ({availableTurns.length} gates)</option>
                        {availableTurns.map((t) => (
                            <option key={t} value={t}>
                                {t}
                            </option>
                        ))}
                    </select>
                </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap gap-2">
                    {[
                        { id: "charts", label: "Charts Workspace" },
                        { id: "filters", label: "Filters & Derived Signals" },
                        { id: "signals", label: `Loaded Signals (${Object.keys(allChannels).length})` },
                        { id: "missions", label: "Training Missions" }
                    ].map((tab) => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`px-4 py-2 rounded-lg text-xs font-semibold transition ${
                                activeTab === tab.id
                                    ? "bg-indigo-600 text-white shadow"
                                    : "bg-gray-900 text-gray-300 border border-gray-800 hover:bg-gray-800"
                            }`}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>

                {totalAnomalies > 0 && (
                    <div className="px-3 py-1.5 rounded-md bg-amber-950/60 border border-amber-500/40 text-xs text-amber-300">
                        {totalAnomalies} sensor dropout / stale-frame windows flagged on timeline
                    </div>
                )}
            </div>

            {loading ? (
                <div className="p-12 text-center text-indigo-400 bg-gray-900/60 border border-gray-800 rounded-xl">
                    Loading and resampling telemetry streams...
                </div>
            ) : (
                <>
                    {activeTab === "charts" && (
                        <div className="space-y-4">
                            <div className="flex flex-wrap gap-2 bg-gray-900/80 border border-gray-800 rounded-lg p-2.5">
                                {[
                                    { id: "multi_trace", label: "Synchronized Multi-Trace" },
                                    { id: "gg_circle", label: "G-G Traction Circle" },
                                    { id: "track_map", label: "2D GPS Track Map" },
                                    { id: "fft_spectrum", label: "FFT Spectrum" },
                                    { id: "damper_hist", label: "Damper Histogram" },
                                    { id: "custom_xy", label: "Custom XY Scatter" },
                                    { id: "lap_overlay", label: "Lap Overlay" }
                                ].map((v) => {
                                    const avail = chartAvailability[v.id] || { enabled: true };
                                    return (
                                        <button
                                            key={v.id}
                                            disabled={!avail.enabled}
                                            title={avail.reason || v.label}
                                            onClick={() => setActiveAnalysisView(v.id)}
                                            className={`px-3 py-1.5 rounded text-xs font-medium disabled:opacity-35 disabled:cursor-not-allowed ${
                                                activeAnalysisView === v.id
                                                    ? "bg-emerald-600 text-white"
                                                    : "bg-gray-800 text-gray-300 hover:bg-gray-700"
                                            }`}
                                        >
                                            {v.label}
                                        </button>
                                    );
                                })}
                            </div>

                            {multiRegionStats && (
                                <div className="bg-indigo-950/40 border border-indigo-500/40 rounded-xl p-4 space-y-3">
                                    <div className="flex flex-wrap items-center justify-between gap-4">
                                        <div>
                                            <div className="text-xs font-bold tracking-wider uppercase text-indigo-300">
                                                SELECTED WINDOW READOUT — {multiRegionStats.channels.length} ACTIVE TRACES
                                            </div>
                                            <div className="text-xs text-gray-400">
                                                {multiRegionStats.primary.sampleCount ?? multiRegionStats.primary.count ?? 0} samples highlighted
                                            </div>
                                        </div>

                                        <div className="flex flex-wrap items-center gap-4 text-xs font-mono">
                                            {Number.isFinite(multiRegionStats.primary.deltaTimeSec ?? multiRegionStats.primary.deltaTime) && (
                                                <div>
                                                    <div className="text-[11px] text-gray-400">Delta Time</div>
                                                    <div className="text-sm font-semibold text-white">
                                                        {(multiRegionStats.primary.deltaTimeSec ?? multiRegionStats.primary.deltaTime).toFixed(3)} s
                                                    </div>
                                                </div>
                                            )}
                                            {Number.isFinite(multiRegionStats.primary.deltaDistanceM ?? multiRegionStats.primary.deltaDistance) && (
                                                <div>
                                                    <div className="text-[11px] text-gray-400">Delta Distance</div>
                                                    <div className="text-sm font-semibold text-white">
                                                        {(multiRegionStats.primary.deltaDistanceM ?? multiRegionStats.primary.deltaDistance).toFixed(1)} m
                                                    </div>
                                                </div>
                                            )}
                                            <button
                                                onClick={openExportModal}
                                                disabled={activeChartChannelKeys.length === 0}
                                                className="px-3 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-xs font-semibold text-white font-sans shadow-sm"
                                            >
                                                Export
                                            </button>
                                            <button
                                                onClick={() => {
                                                    setRegionSelection(null);
                                                    setIsExportModalOpen(false);
                                                }}
                                                className="px-3 py-1.5 rounded-md bg-gray-800 hover:bg-gray-700 border border-gray-700 text-xs text-gray-200 font-sans"
                                            >
                                                Clear
                                            </button>
                                        </div>
                                    </div>

                                    <div className="overflow-x-auto border border-indigo-500/20 rounded-lg">
                                        <table className="w-full text-left text-xs font-mono">
                                            <thead className="bg-gray-950/70 text-gray-400 border-b border-gray-800 font-sans">
                                                <tr>
                                                    <th className="py-2 px-3">Signal</th>
                                                    <th className="py-2 px-3">Minimum</th>
                                                    <th className="py-2 px-3">Peak (Max)</th>
                                                    <th className="py-2 px-3">Average</th>
                                                    <th className="py-2 px-3">RMS</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-800/70 bg-gray-950/40">
                                                {multiRegionStats.channels.map((item) => {
                                                    const s = item.stats;
                                                    const unitSuffix = item.unit ? ` ${item.unit}` : "";
                                                    return (
                                                        <tr key={item.key} className="hover:bg-indigo-950/30">
                                                            <td className="py-2 px-3 font-sans font-medium">
                                                                <span className={item.isDerived ? "text-emerald-300" : "text-indigo-200"}>
                                                                    {item.label}
                                                                </span>
                                                            </td>
                                                            <td className="py-2 px-3 text-cyan-300">
                                                                {formatStatValue(s.min)}{unitSuffix}
                                                            </td>
                                                            <td className="py-2 px-3 text-pink-300">
                                                                {formatStatValue(s.max)}{unitSuffix}
                                                            </td>
                                                            <td className="py-2 px-3 text-amber-300">
                                                                {formatStatValue(s.avg ?? s.mean)}{unitSuffix}
                                                            </td>
                                                            <td className="py-2 px-3 text-indigo-300">
                                                                {formatStatValue(s.rms)}{unitSuffix}
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}

                            {activeAnalysisView === "multi_trace" && (
                                <div className="space-y-3">
                                    <div className="flex flex-wrap gap-1.5 bg-gray-900/60 border border-gray-800 rounded-lg p-3">
                                        {Object.keys(allChannels).map((key) => {
                                            const active = selectedTraceKeys.includes(key);
                                            const isDerived = key === "Virtual_TPS" || Boolean(derivedChannels[key]);
                                            return (
                                                <button
                                                    key={key}
                                                    onClick={() => toggleTraceChannel(key)}
                                                    className={`px-2.5 py-1 rounded-full text-xs border transition ${
                                                        active
                                                            ? isDerived
                                                                ? "bg-emerald-600/90 border-emerald-400 text-white"
                                                                : "bg-indigo-600/90 border-indigo-400 text-white"
                                                            : "bg-gray-800 border-gray-700 text-gray-400 hover:text-white"
                                                    }`}
                                                >
                                                    {allLabels[key] || key}
                                                </button>
                                            );
                                        })}
                                    </div>

                                    <MultiTraceChart
                                        selectedChannels={selectedTraceKeys}
                                        allChannels={allChannels}
                                        labels={allLabels}
                                        units={allUnits}
                                        anomalies={baseStore.anomalies}
                                        timeMs={baseStore.timeMs}
                                        distanceM={allChannels.Distance}
                                        geoData={geoData}
                                        gatesData={gatesJson || baseStore.gatesData}
                                        xAxisMode={xAxisMode}
                                        onRegionSelect={(startX, endX, channelKey) =>
                                            setRegionSelection({ startX, endX, channelKey })
                                        }
                                    />
                                </div>
                            )}

                            {activeAnalysisView === "gg_circle" && <SandboxGGChart allChannels={allChannels} />}

                            {activeAnalysisView === "track_map" && (
                                <SandboxTrackMap
                                    allChannels={allChannels}
                                    timeMs={baseStore.timeMs}
                                    geoData={geoData}
                                    gatesData={gatesJson}
                                />
                            )}

                            {activeAnalysisView === "fft_spectrum" && (
                                <FFTChart
                                    allChannels={allChannels}
                                    labels={allLabels}
                                    timeMs={baseStore.timeMs}
                                    runTask={runTask}
                                />
                            )}

                            {activeAnalysisView === "damper_hist" && (
                                <DamperHistogramChart
                                    allChannels={allChannels}
                                    timeMs={baseStore.timeMs}
                                    runTask={runTask}
                                />
                            )}

                            {activeAnalysisView === "custom_xy" && (
                                <CustomXYChart
                                    allChannels={allChannels}
                                    labels={allLabels}
                                    units={allUnits}
                                />
                            )}

                            {activeAnalysisView === "lap_overlay" && (
                                <LapOverlayChart
                                    allChannels={allChannels}
                                    labels={allLabels}
                                    units={allUnits}
                                    timeMs={baseStore.timeMs}
                                    gatesData={baseStore.gatesData}
                                />
                            )}
                        </div>
                    )}

                    {activeTab === "filters" && (
                        <FilterWorkbench
                            rawChannels={baseStore.rawChannels}
                            allChannels={allChannels}
                            residuals={residuals}
                            labels={allLabels}
                            units={allUnits}
                            timeMs={baseStore.timeMs}
                            fs={baseStore.fs}
                            recipes={recipes}
                            onAddRecipe={handleAddRecipe}
                            onDeleteRecipe={handleDeleteRecipe}
                            onImportRecipes={(imported) => setRecipes(imported)}
                            onCreateTareChannel={handleCreateTareChannel}
                            onCreateDerivativeChannel={handleCreateDerivativeChannel}
                            onCreateMatlabChannel={handleCreateMatlabChannel}
                        />
                    )}

                    {activeTab === "signals" && (
                        <div className="bg-gray-900/90 border border-gray-800 rounded-lg overflow-hidden">
                            <table className="w-full text-left text-xs">
                                <thead className="bg-gray-950 text-gray-400 uppercase border-b border-gray-800">
                                    <tr>
                                        <th className="py-3 px-4">Channel Key</th>
                                        <th className="py-3 px-4">Display Label</th>
                                        <th className="py-3 px-4">Layer</th>
                                        <th className="py-3 px-4">Unit</th>
                                        <th className="py-3 px-4">Samples</th>
                                        <th className="py-3 px-4">Health / Dropouts</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-800">
                                    {Object.keys(allChannels).map((key) => {
                                        const isDerived = key === "Virtual_TPS" || Boolean(derivedChannels[key]);
                                        const issues = baseStore.anomalies?.[key] || [];
                                        return (
                                            <tr key={key} className="hover:bg-gray-800/40">
                                                <td className="py-2.5 px-4 font-mono text-indigo-300">{key}</td>
                                                <td className="py-2.5 px-4 text-white">{allLabels[key] || key}</td>
                                                <td className="py-2.5 px-4">
                                                    <span
                                                        className={`px-2 py-0.5 rounded text-[11px] ${
                                                            isDerived
                                                                ? "bg-emerald-500/20 text-emerald-300"
                                                                : "bg-gray-800 text-gray-300"
                                                        }`}
                                                    >
                                                        {isDerived ? "Derived" : "Raw"}
                                                    </span>
                                                </td>
                                                <td className="py-2.5 px-4 text-gray-400">{allUnits[key] || "-"}</td>
                                                <td className="py-2.5 px-4 font-mono">{allChannels[key].length}</td>
                                                <td className="py-2.5 px-4">
                                                    {issues.length === 0 ? (
                                                        <span className="text-emerald-400">Clean</span>
                                                    ) : (
                                                        <span className="text-amber-400">{issues.length} flagged</span>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {activeTab === "missions" && (
                        <MissionsPanel
                            allChannels={allChannels}
                            onLoadPreset={(presetId) => {
                                setSelectedSourceId(`preset:${presetId}`);
                                setActiveTab("filters");
                            }}
                        />
                    )}
                </>
            )}

            {isExportModalOpen && regionSelection && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4"
                    onClick={() => setIsExportModalOpen(false)}
                >
                    <div
                        className="w-full max-w-2xl bg-gray-900 border border-gray-700 rounded-xl shadow-2xl overflow-hidden"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="px-5 py-4 bg-gray-950 border-b border-gray-800 flex items-center justify-between">
                            <div>
                                <h2 className="text-sm font-bold text-white uppercase tracking-wider">
                                    Export Selected Window Data
                                </h2>
                                <p className="text-xs text-gray-400 mt-0.5">
                                    {windowSliceIndices.length} samples selected (
                                    {xAxisMode === "distance"
                                        ? `${Math.min(regionSelection.startX, regionSelection.endX).toFixed(1)} m → ${Math.max(regionSelection.startX, regionSelection.endX).toFixed(1)} m`
                                        : `${Math.min(regionSelection.startX, regionSelection.endX).toFixed(0)} ms → ${Math.max(regionSelection.startX, regionSelection.endX).toFixed(0)} ms`}
                                    )
                                </p>
                            </div>
                            <button
                                onClick={() => setIsExportModalOpen(false)}
                                className="px-2.5 py-1 rounded bg-gray-800 hover:bg-gray-700 text-xs text-gray-300"
                            >
                                ✕
                            </button>
                        </div>

                        <div className="p-5 space-y-4">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="flex flex-wrap items-center gap-2">
                                    <button
                                        onClick={() => setExportSelectedKeys([...activeChartChannelKeys])}
                                        className="px-2.5 py-1 rounded bg-gray-800 hover:bg-gray-700 border border-gray-700 text-xs text-gray-200"
                                    >
                                        Select All Active ({activeChartChannelKeys.length})
                                    </button>
                                    <button
                                        onClick={() => setExportSelectedKeys([])}
                                        className="px-2.5 py-1 rounded bg-gray-800 hover:bg-gray-700 border border-gray-700 text-xs text-gray-400"
                                    >
                                        Clear All
                                    </button>
                                </div>

                                <div className="flex items-center gap-2 text-xs">
                                    <span className="text-gray-400">Format:</span>
                                    <div className="flex rounded-md overflow-hidden border border-gray-700">
                                        <button
                                            onClick={() => setExportFormat("csv")}
                                            className={`px-3 py-1 ${
                                                exportFormat === "csv"
                                                    ? "bg-emerald-600 text-white font-semibold"
                                                    : "bg-gray-800 text-gray-300"
                                            }`}
                                        >
                                            CSV
                                        </button>
                                        <button
                                            onClick={() => setExportFormat("json")}
                                            className={`px-3 py-1 ${
                                                exportFormat === "json"
                                                    ? "bg-emerald-600 text-white font-semibold"
                                                    : "bg-gray-800 text-gray-300"
                                            }`}
                                        >
                                            JSON
                                        </button>
                                    </div>
                                </div>
                            </div>

                            <div className="max-h-72 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-2 p-3 bg-gray-950/70 border border-gray-800 rounded-lg">
                                {activeChartChannelKeys.map((key) => {
                                    const checked = exportSelectedKeys.includes(key);
                                    const isDerived =
                                        key === "Virtual_TPS" || Boolean(derivedChannels[key]);
                                    return (
                                        <label
                                            key={key}
                                            className={`flex items-center justify-between gap-2 px-3 py-2 rounded-md border text-xs cursor-pointer transition ${
                                                checked
                                                    ? "bg-indigo-950/50 border-indigo-500/60 text-white"
                                                    : "bg-gray-900/70 border-gray-800 text-gray-400 hover:border-gray-700"
                                            }`}
                                        >
                                            <div className="flex items-center gap-2 min-w-0">
                                                <input
                                                    type="checkbox"
                                                    checked={checked}
                                                    onChange={() => toggleExportKey(key)}
                                                    className="rounded border-gray-600 bg-gray-800 text-emerald-500 focus:ring-0"
                                                />
                                                <span className="truncate font-medium">
                                                    {allLabels[key] || key}
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-1.5 shrink-0">
                                                {isDerived && (
                                                    <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-[10px] text-emerald-300">
                                                        Derived
                                                    </span>
                                                )}
                                                <span className="text-[11px] font-mono text-gray-500">
                                                    {allUnits[key] || "-"}
                                                </span>
                                            </div>
                                        </label>
                                    );
                                })}
                            </div>
                        </div>

                        <div className="px-5 py-3.5 bg-gray-950 border-t border-gray-800 flex items-center justify-between">
                            <span className="text-xs text-gray-400">
                                {exportSelectedKeys.length} channel{exportSelectedKeys.length === 1 ? "" : "s"} selected
                            </span>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => setIsExportModalOpen(false)}
                                    className="px-3.5 py-1.5 rounded-md bg-gray-800 hover:bg-gray-700 border border-gray-700 text-xs text-gray-300"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleExportWindowData}
                                    disabled={
                                        exportSelectedKeys.length === 0 || windowSliceIndices.length === 0
                                    }
                                    className="px-4 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-xs font-semibold text-white"
                                >
                                    Download {exportFormat.toUpperCase()}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}