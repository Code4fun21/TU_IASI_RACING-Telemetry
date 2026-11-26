import { useEffect, useState, useMemo, useContext } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { api } from "../services/api";
import { DriverContext } from "../context/DriverContext";
import { useTelemetry } from "../store/OfflineDataStoreadge";

// --- COMPONENTS ---
import MapChart from "../components/MapChart";
import TimestampSelect from "../pages/MQTT/Components/TimestampSelect";

// Ensure these paths match your folder structure exactly
import AutoPairChart from "./MQTT/MoreCharts/Charts/AutoPairChart";
import VitalChart from "./MQTT/MoreCharts/Charts/VitalChart";
import VitalChart_distance from "./MQTT/MoreCharts/Charts/VitalChart_distance";
import LapTimesPanel from "../pages/MQTT/MoreCharts/Charts/LapTimesPanel";

// --- CONSTANTS ---
const MAX_SIGNALS = 5;

// --- HELPERS (File Loading) ---
const readBlobAsText = (blob) => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsText(blob);
    });
};

// --- HELPERS (GPS Drift Alignment, Smoothing, Boundary Containment & Gate Crossing Detection) ---
const isValidCoord = (lat, lon) =>
    typeof lat === "number" &&
    typeof lon === "number" &&
    !isNaN(lat) &&
    !isNaN(lon) &&
    Math.abs(lat) > 0.001 &&
    Math.abs(lon) > 0.001;

const extractRing = (feature) => {
    let coords = feature?.geometry?.coordinates || [];
    if (feature?.geometry?.type === "Polygon") {
        coords = coords[0] || [];
    }
    if (
        coords.length > 2 &&
        coords[0][0] === coords[coords.length - 1][0] &&
        coords[0][1] === coords[coords.length - 1][1]
    ) {
        return coords.slice(0, -1);
    }
    return coords;
};

const nearestOnPolyline = (lon, lat, polyline) => {
    const n = polyline.length;
    if (n === 0) return [lon, lat];
    if (n === 1) return [polyline[0][0], polyline[0][1]];

    const cosLat = Math.cos((lat * Math.PI) / 180);
    let bestDistSq = Infinity;
    let bestLon = polyline[0][0];
    let bestLat = polyline[0][1];

    for (let i = 0; i < n; i++) {
        const a = polyline[i];
        const b = polyline[(i + 1) % n];
        const dx = (b[0] - a[0]) * cosLat;
        const dy = b[1] - a[1];
        const lenSq = dx * dx + dy * dy;

        let t = 0;
        if (lenSq > 0) {
            t = (((lon - a[0]) * cosLat) * dx + (lat - a[1]) * dy) / lenSq;
            if (t < 0) t = 0;
            else if (t > 1) t = 1;
        }

        const projLon = a[0] + t * (b[0] - a[0]);
        const projLat = a[1] + t * (b[1] - a[1]);
        const ex = (lon - projLon) * cosLat;
        const ey = lat - projLat;
        const distSq = ex * ex + ey * ey;

        if (distSq < bestDistSq) {
            bestDistSq = distSq;
            bestLon = projLon;
            bestLat = projLat;
        }
    }

    return [bestLon, bestLat];
};

const isPointInRing = (lon, lat, ring) => {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const xi = ring[i][0], yi = ring[i][1];
        const xj = ring[j][0], yj = ring[j][1];
        const intersect =
            (yi > lat) !== (yj > lat) &&
            lon < ((xj - xi) * (lat - yi)) / ((yj - yi) || 1e-12) + xi;
        if (intersect) inside = !inside;
    }
    return inside;
};

const median = (values) => {
    if (!values || values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0
        ? (sorted[mid - 1] + sorted[mid]) / 2
        : sorted[mid];
};

const smoothGpsSeries = (latSeries, lonSeries) => {
    const pairCount = Math.min(latSeries?.length || 0, lonSeries?.length || 0);
    if (pairCount < 3) return { latSeries, lonSeries };

    const outLat = latSeries.map((pt) => [...pt]);
    const outLon = lonSeries.map((pt) => [...pt]);

    for (let i = 1; i < pairCount - 1; i++) {
        const prevLat = latSeries[i - 1][1], prevLon = lonSeries[i - 1][1];
        const currLat = latSeries[i][1], currLon = lonSeries[i][1];
        const nextLat = latSeries[i + 1][1], nextLon = lonSeries[i + 1][1];

        if (!isValidCoord(prevLat, prevLon) || !isValidCoord(currLat, currLon) || !isValidCoord(nextLat, nextLon)) {
            continue;
        }

        const dtPrev = Math.abs(latSeries[i][0] - latSeries[i - 1][0]);
        const dtNext = Math.abs(latSeries[i + 1][0] - latSeries[i][0]);
        if (dtPrev > 1500 || dtNext > 1500) continue;

        outLat[i][1] = 0.25 * prevLat + 0.5 * currLat + 0.25 * nextLat;
        outLon[i][1] = 0.25 * prevLon + 0.5 * currLon + 0.25 * nextLon;
    }

    return { latSeries: outLat, lonSeries: outLon };
};

const alignGpsSeriesToTrack = (latSeries, lonSeries, trackGeoJson) => {
    if (
        !latSeries?.length ||
        !lonSeries?.length ||
        !trackGeoJson?.features ||
        trackGeoJson.features.length < 2
    ) {
        return { latSeries, lonSeries };
    }

    const outer = extractRing(trackGeoJson.features[0]);
    const inner = extractRing(trackGeoJson.features[1]);
    if (outer.length < 3 || inner.length < 3) {
        return { latSeries, lonSeries };
    }

    const centerline = outer.map((p) => {
        const innerPt = nearestOnPolyline(p[0], p[1], inner);
        return [(p[0] + innerPt[0]) / 2, (p[1] + innerPt[1]) / 2];
    });

    const pairCount = Math.min(latSeries.length, lonSeries.length);
    const latOffsets = [];
    const lonOffsets = [];

    for (let i = 0; i < pairCount; i++) {
        const lat = latSeries[i][1];
        const lon = lonSeries[i][1];
        if (!isValidCoord(lat, lon)) continue;

        const [projLon, projLat] = nearestOnPolyline(lon, lat, centerline);
        const dLat = lat - projLat;
        const dLon = lon - projLon;
        const approxMeters = Math.hypot(
            dLon * 111320 * Math.cos((lat * Math.PI) / 180),
            dLat * 111320
        );

        if (approxMeters < 25) {
            latOffsets.push(dLat);
            lonOffsets.push(dLon);
        }
    }

    const shiftLat = latOffsets.length > 0 ? median(latOffsets) : 0;
    const shiftLon = lonOffsets.length > 0 ? median(lonOffsets) : 0;

    const alignedLat = new Array(latSeries.length);
    const alignedLon = new Array(lonSeries.length);

    for (let i = 0; i < pairCount; i++) {
        const tsLat = latSeries[i][0];
        const tsLon = lonSeries[i][0];
        let lat = latSeries[i][1];
        let lon = lonSeries[i][1];

        if (isValidCoord(lat, lon)) {
            lat -= shiftLat;
            lon -= shiftLon;

            const insideOuter = isPointInRing(lon, lat, outer);
            const insideInner = isPointInRing(lon, lat, inner);

            if (!insideOuter || insideInner) {
                const boundary = !insideOuter ? outer : inner;
                const [wallLon, wallLat] = nearestOnPolyline(lon, lat, boundary);
                const [centerLon, centerLat] = nearestOnPolyline(wallLon, wallLat, centerline);
                lon = wallLon + 0.15 * (centerLon - wallLon);
                lat = wallLat + 0.15 * (centerLat - wallLat);
            }
        }

        alignedLat[i] = [tsLat, lat];
        alignedLon[i] = [tsLon, lon];
    }

    for (let i = pairCount; i < latSeries.length; i++) alignedLat[i] = [...latSeries[i]];
    for (let i = pairCount; i < lonSeries.length; i++) alignedLon[i] = [...lonSeries[i]];

    return { latSeries: alignedLat, lonSeries: alignedLon };
};

const detectGateCrossings = (latSeries, lonSeries, gates, extraToleranceMeters = 12.0) => {
    const pairCount = Math.min(latSeries?.length || 0, lonSeries?.length || 0);
    if (pairCount < 2 || !gates || gates.length === 0) return [];

    const points = [];
    for (let i = 0; i < pairCount; i++) {
        const lat = latSeries[i][1];
        const lon = lonSeries[i][1];
        if (isValidCoord(lat, lon)) {
            points.push({ time: latSeries[i][0], lat, lon });
        }
    }
    if (points.length < 2) return [];

    const refLat = (gates[0].lat1 + gates[0].lat2) / 2;
    const refLon = (gates[0].lon1 + gates[0].lon2) / 2;
    const cosLat = Math.cos((refLat * Math.PI) / 180);
    const metersPerLat = 111320;
    const metersPerLon = 111320 * cosLat;

    const toXY = (lat, lon) => [
        (lon - refLon) * metersPerLon,
        (lat - refLat) * metersPerLat
    ];

    const projectedGates = gates.map((g) => {
        const [ax, ay] = toXY(g.lat1, g.lon1);
        const [bx, by] = toXY(g.lat2, g.lon2);
        const mx = (ax + bx) / 2;
        const my = (ay + by) / 2;
        const halfWidth = Math.hypot(bx - ax, by - ay) / 2;
        return {
            name: g.name,
            ax,
            ay,
            bx,
            by,
            mx,
            my,
            maxRadius: halfWidth + extraToleranceMeters,
            flowX: 0,
            flowY: 0
        };
    });

    const gateCount = projectedGates.length;
    for (let i = 0; i < gateCount; i++) {
        const prev = projectedGates[(i - 1 + gateCount) % gateCount];
        const curr = projectedGates[i];
        const next = projectedGates[(i + 1) % gateCount];

        const v1x = curr.mx - prev.mx;
        const v1y = curr.my - prev.my;
        const l1 = Math.hypot(v1x, v1y) || 1;

        const v2x = next.mx - curr.mx;
        const v2y = next.my - curr.my;
        const l2 = Math.hypot(v2x, v2y) || 1;

        const fx = v1x / l1 + v2x / l2;
        const fy = v1y / l1 + v2y / l2;
        const fl = Math.hypot(fx, fy) || 1;
        curr.flowX = fx / fl;
        curr.flowY = fy / fl;
    }

    const crossings = [];
    const lastTriggerTime = new Array(gateCount).fill(-Infinity);

    for (let i = 0; i < points.length - 1; i++) {
        const p1 = points[i];
        const p2 = points[i + 1];
        const [p1x, p1y] = toXY(p1.lat, p1.lon);
        const [p2x, p2y] = toXY(p2.lat, p2.lon);

        const rx = p2x - p1x;
        const ry = p2y - p1y;
        const moveLen = Math.hypot(rx, ry);
        if (moveLen < 0.1) continue;

        for (let gIdx = 0; gIdx < gateCount; gIdx++) {
            const gate = projectedGates[gIdx];
            const sx = gate.bx - gate.ax;
            const sy = gate.by - gate.ay;
            const denom = rx * sy - ry * sx;
            if (Math.abs(denom) < 1e-9) continue;

            const t = ((gate.ax - p1x) * sy - (gate.ay - p1y) * sx) / denom;
            if (t < 0 || t > 1) continue;

            const cx = p1x + t * rx;
            const cy = p1y + t * ry;
            const distFromMid = Math.hypot(cx - gate.mx, cy - gate.my);
            if (distFromMid > gate.maxRadius) continue;

            if (gateCount >= 3) {
                const dot = (rx / moveLen) * gate.flowX + (ry / moveLen) * gate.flowY;
                if (dot < 0.3) continue;
            }

            const crossTime = p1.time + t * (p2.time - p1.time);
            const minCooldown = /^S\d+$/i.test(gate.name) ? 5000 : 1500;
            if (Math.abs(crossTime - lastTriggerTime[gIdx]) < minCooldown) continue;

            lastTriggerTime[gIdx] = crossTime;
            crossings.push({
                gateIndex: gIdx,
                gateName: gate.name,
                time: crossTime
            });
        }
    }

    crossings.sort((a, b) => a.time - b.time);
    return crossings;
};

const enrichLapFields = (lap, index) => {
    const out = { ...lap };
    if (out.lap == null) out.lap = index + 1;

    const lapEnd = out.S3 ?? out.ts;
    if (out.S0 != null && lapEnd != null) {
        const total = lapEnd - out.S0;
        if (out.lap_time == null) out.lap_time = total;
        if (out.lapTime == null) out.lapTime = out.lap_time;
        if (out.ts == null) out.ts = lapEnd;
        if (out.S3 == null) out.S3 = lapEnd;
    }

    if (out.S0 != null && out.S1 != null) {
        const s1 = out.S1 - out.S0;
        out.sector1 = s1;
        out.S1_time = s1;
    }
    if (out.S1 != null && out.S2 != null) {
        const s2 = out.S2 - out.S1;
        out.sector2 = s2;
        out.S2_time = s2;
    }
    if (out.S2 != null && lapEnd != null) {
        const s3 = lapEnd - out.S2;
        out.sector3 = s3;
        out.S3_time = s3;
    }

    return out;
};

const buildGatesTimesFromCrossings = (crossings) => {
    if (!crossings || crossings.length === 0) {
        return { timestamps: [], lap_data: [] };
    }

    const lapData = [];
    let currentLap = null;

    for (const c of crossings) {
        if (c.gateName === "S0") {
            if (currentLap && currentLap.S0 !== undefined) {
                const lapEnd = c.time;
                currentLap.S3 = lapEnd;
                currentLap.ts = lapEnd;
                currentLap.complete = true;
                lapData.push(enrichLapFields(currentLap, lapData.length));
            }
            currentLap = { S0: c.time };
        } else if (currentLap) {
            currentLap[c.gateName] = c.time;
        }
    }

    return {
        timestamps: crossings.map((c) => ({ gate: c.gateName, time: c.time })),
        lap_data: lapData
    };
};

const resolveGatesTimes = (rawGatesTimes, crossings) => {
    const existingLaps = Array.isArray(rawGatesTimes?.lap_data) ? rawGatesTimes.lap_data : [];

    // When backend/file lap_data already exists, keep every lap intact and only fill in
    // missing sector or corner gates (e.g., missed S2 on Laps #1 and #4) from GPS crossings.
    if (existingLaps.length > 0) {
        const mergedLaps = existingLaps.map((lap, idx) => {
            const merged = { ...lap };
            const start = Number(merged.S0);
            const end = Number(merged.S3 ?? merged.ts);

            if (Array.isArray(crossings) && crossings.length > 0 && Number.isFinite(start) && Number.isFinite(end)) {
                for (const c of crossings) {
                    if (c.gateName === "S0" || c.gateName === "S3") continue;
                    if (c.time > start + 1500 && c.time < end - 1500 && merged[c.gateName] == null) {
                        merged[c.gateName] = c.time;
                    }
                }
            }

            return enrichLapFields(merged, idx);
        });

        return {
            ...(rawGatesTimes || {}),
            lap_data: mergedLaps
        };
    }

    if (Array.isArray(crossings) && crossings.length > 0) {
        const recomputed = buildGatesTimesFromCrossings(crossings);
        if (recomputed.lap_data.length > 0) {
            return recomputed;
        }
    }

    return rawGatesTimes || { timestamps: [], lap_data: [] };
};

export class ButterworthProcessor {
    constructor() {
        this.coeffs = null;
    }

    setConfiguration(fs, fc) {
        const safeFc = Math.min(fc, (fs / 2) * 0.9); // Rule: Nyquist safety margin
        const oh = Math.tan(Math.PI * safeFc / fs);
        const oh2 = oh * oh;
        const sn = Math.sqrt(2.0);
        const a0 = 1 + sn * oh + oh2;
        
        this.coeffs = {
            a: [1, 2 * (oh2 - 1) / a0, (1 - sn * oh + oh2) / a0],
            b: [oh2 / a0, 2 * (oh2 / a0), oh2 / a0]
        };
    }

    applyFilter(input) {
        const { a, b } = this.coeffs;
        const len = input.length;
        const output = new Array(len);

        // Rule: Start-Up Transient Fix (Padding)
        let x1 = input[0], x2 = input[0];
        let y1 = input[0], y2 = input[0];

        for (let i = 0; i < len; i++) {
            output[i] = (b[0] * input[i]) + (b[1] * x1) + (b[2] * x2)
                - (a[1] * y1) - (a[2] * y2);
            
            // Shift memory
            x2 = x1; x1 = input[i];
            y2 = y1; y1 = output[i];
        }
        return output;
    }

    filtFilt(data, fs, fc) {
        if (!data || data.length < 30) return data;
        this.setConfiguration(fs, fc);

        // Rule: Pad BOTH ends to prevent start/end spikes
        const padFront = new Array(15).fill(data[0]);
        const padBack = new Array(15).fill(data[data.length - 1]);
        const paddedData = [...padFront, ...data, ...padBack];

        // Forward Pass -> Reverse -> Backward Pass -> Final Reverse
        let result = this.applyFilter(paddedData);
        result.reverse();
        result = this.applyFilter(result);
        const final = result.reverse();
        
        // Trim BOTH pads off before returning
        return final.slice(15, final.length - 15);
    }
}

class TelemetryProcessor {
    constructor() {
        this.bw = new ButterworthProcessor();
    }

    // Rule 1: Centripetal Correction with Unit Conversion
    removeCentripetal(ayMeasured, yawRateDeg, velocityKmh) {
        const yawRateRad = yawRateDeg * (Math.PI / 180);
        const velocityMs = velocityKmh / 3.6;
        const centripetalG = (yawRateRad * velocityMs) / 9.80665;
        return ayMeasured - centripetalG;
    }

    // Rule 2: Adaptive G-Gate (Sliding StdDev)
    getAdaptiveFc(values, baseFc) {
        if (values.length < 50) return baseFc;

        const sample = values.slice(0, 100); 
        const mean = sample.reduce((a, b) => a + b, 0) / sample.length;
        const variance = sample.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / sample.length;
        const stdDev = Math.sqrt(variance);

        return stdDev > 0.15 ? 3.0 : baseFc;
    }

    // Rule 3: Gravity Compensation (Roll Gradient Approximation)
    compensateRoll(ayMeasured, azMeasured, rollGradient = 3.5) {
        const phi = (ayMeasured * rollGradient) * (Math.PI / 180);
        return (ayMeasured * Math.cos(phi)) - (azMeasured * Math.sin(phi));
    }
}

const haversine = (lat1, lon1, lat2, lon2) => {
    const toRad = (deg) => (deg * Math.PI) / 180;
    const R = 6371;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
};

export default function Dashboard() {
    const navigate = useNavigate();
    const location = useLocation();
    const { driverData } = useContext(DriverContext);

    // ==========================================
    // 1. DATA PREPARATION
    // ==========================================
    const { setTelemetryData, setSessionInfo, telemetryData, sessionInfo } = useTelemetry();

    // Extract BOTH possible variables from the router
    const { fileData, session: navSession, sessionId: navSessionId } = location.state || {};

    // Find the true Session ID, regardless of how the router passed it
    const activeSessionId = navSession?.id || navSessionId || sessionInfo?.id;
    const currentSession = navSession || sessionInfo;

    useEffect(() => {
        console.log("Router State:", location.state);
        console.log("Resolved Session ID for Dropdown:", activeSessionId);
    }, [location.state, activeSessionId]);

    const rawData = useMemo(() => {
        if (fileData && Array.isArray(fileData.rows)) return fileData.rows;
        if (Array.isArray(fileData)) return fileData;
        return [];
    }, [fileData]);

    const [geoData, setGeoData] = useState(null);
    const [gatesData, setGatesData] = useState([]);
    const [selectedTs, setSelectedTs] = useState(null);
    const [selectedLap, setSelectedLap] = useState(null);
    const [selectedTurn, setSelectedTurn] = useState(null);

    // Chart Builder State
    const [staged, setStaged] = useState([]);
    const [pick, setPick] = useState("");
    const [committed, setCommitted] = useState([]);

    // --- DRIVER MAPPING FOR UI ---
    const [driversMap, setDriversMap] = useState({});

    useEffect(() => {
        api.getDrivers()
            .then(data => {
                const map = {};
                if (data) data.forEach(d => map[d.id] = d.name);
                setDriversMap(map);
            })
            .catch(err => console.error("Error fetching drivers:", err));
    }, []);

    // Safety Check
    useEffect(() => {
        if (!rawData || rawData.length === 0) console.warn("No valid file data found.");
    }, [rawData]);

    // Fetch Track Assets
    useEffect(() => {
        if (!currentSession?.trackId) return;
        let isMounted = true;
        const fetchTrackFiles = async () => {
            try {
                const track = await api.getTrackById(currentSession.trackId);
                const [gatesBlob, layoutBlob] = await Promise.all([
                    api.downloadFile(track.gates),
                    api.downloadFile(track.coordinates)
                ]);
                const gatesText = await readBlobAsText(gatesBlob);
                const layoutText = await readBlobAsText(layoutBlob);
                if (isMounted) {
                    setGatesData(JSON.parse(gatesText));
                    setGeoData(JSON.parse(layoutText));
                }
            } catch (err) {
                console.error("Error loading track/gates:", err);
            }
        };
        fetchTrackFiles();
        return () => { isMounted = false; };
    }, [currentSession?.trackId]);

    // ---------- DATA PARSING & CONVERSION ----------
    const parsedData = useMemo(() => {
        if (!rawData || rawData.length === 0) return null;

        const extract = (targetKey, scaleFn = (v) => v) => {
            const keyMap = {
                "RPM": "rpm", "Throttle_position": "throttlePosition", "Battery_voltage": "batteryVoltage",
                "Coolant_temperature": "coolantTemp", "Manifold_air_pressure": "manifoldAirPressure",
                "Manifold_air_temperature": "manifoldAirTemp", "GPS_Latitude": "GPS_Latitude",
                "GPS_Longitude": "GPS_Longitude", "GPS_Speed": "GPS_Speed", "ECU_time": "ECU_time",
                
                "Gyroscope_on_X_axis": "gyroX", "Gyroscope_on_Y_axis": "gyroY", "Gyroscope_on_Z_axis": "gyroZ",
                
                "Brake_Pressure": "brakePressure", "Gear": "gear", "Steering_Angle": "steering",
                "BSPD": "bspd", "Damper_Left_Rear": "damperLR", "Damper_Right_Rear": "damperRR",
                "Damper_Left_Front": "damperLF", "Damper_Right_Front": "damperRF",
                
                "Air_density_correction": "airDensityCorrection", "Warmup_correction": "warmupCorrection",
                "TPS_based_acceleration": "tpsBasedAcceleration", "TPS_based_fuel_cut": "tpsBasedFuelCut",
                "Total_fuel_correction": "totalfuelCorrection", "VE_value_table_bank1": "veValueTable/bank1",
                "VE_value_table_bank2": "veValueTable/bank2", "Cold_advance": "coldAdvance",
                "Rate_of_change_of_TPS": "rateOfchangeOfTPS", "Rate_of_change_of_RPM": "rateOfChangeOfRPM",
                "Sync_loss_counter": "sync-lossCounter", "Sync_loss_reason_code": "sync-lossReasonCode",
                "Average_fuel_flow": "averageFuelFlow",
                "Distance": "Distance",
                "Acceleration_on_X_axis_rotated": "accelerationX_rotated", 
                "Acceleration_on_Y_axis_rotated": "accelerationY_rotated", 
                "Acceleration_on_Z_axis_rotated": "accelerationZ_rotated", 
                
                "Acceleration_on_X_axis_RAW": "accelerationX_RAW", 
                "Acceleration_on_Y_axis_RAW": "accelerationY_RAW", 
                "Acceleration_on_Z_axis_RAW": "accelerationZ_RAW", 

                "Acceleration_on_X_axis": "accelerationX", 
                "Acceleration_on_Y_axis": "accelerationY", 
                "Acceleration_on_Z_axis": "accelerationZ",
                "Lap_Times": "lapTime", 
            };
            const sourceKey = keyMap[targetKey] || targetKey;
            const STEP = 1;
            const result = [];

            for (let i = 0; i < rawData.length; i += STEP) {
                const row = rawData[i];
                const ts = Number(row.timestamp);
                let val = null;

                if (targetKey === "ECU_time") {
                    val = ts;
                } else if (Object.prototype.hasOwnProperty.call(row, sourceKey)) {
                    const rawVal = row[sourceKey];
                    if (rawVal !== null && rawVal !== undefined && rawVal !== "") {
                        const num = Number(rawVal);
                        if (!isNaN(num)) val = scaleFn(num);
                    }
                }

                if (val !== null) result.push([ts, val]);
            }
            return result;
        };

        const out = {
            ECU_time: extract("ECU_time"), 
            RPM: extract("RPM"), 
            Manifold_air_pressure: extract("Manifold_air_pressure"),
            Manifold_air_temperature: extract("Manifold_air_temperature"), 
            Coolant_temperature: extract("Coolant_temperature"),
            Throttle_position: extract("Throttle_position"), 
            Battery_voltage: extract("Battery_voltage"),
            GPS_Latitude: extract("GPS_Latitude"), 
            GPS_Longitude: extract("GPS_Longitude"), 
            GPS_Speed: extract("GPS_Speed"),
            
            Gyroscope_on_X_axis: extract("Gyroscope_on_X_axis"),
            Gyroscope_on_Y_axis: extract("Gyroscope_on_Y_axis"), 
            Gyroscope_on_Z_axis: extract("Gyroscope_on_Z_axis"),
            Brake_Pressure: extract("Brake_Pressure"), 
            Gear: extract("Gear"), 
            Steering_Angle: extract("Steering_Angle"),
            BSPD: extract("BSPD"), 
            Damper_Left_Rear: extract("Damper_Left_Rear"), 
            Damper_Right_Rear: extract("Damper_Right_Rear"),
            Damper_Left_Front: extract("Damper_Left_Front"), 
            Damper_Right_Front: extract("Damper_Right_Front"),
            Air_density_correction: extract("Air_density_correction"), 
            Warmup_correction: extract("Warmup_correction"),
            TPS_based_acceleration: extract("TPS_based_acceleration"), 
            TPS_based_fuel_cut: extract("TPS_based_fuel_cut"),
            Total_fuel_correction: extract("Total_fuel_correction"), 
            VE_value_table_bank1: extract("VE_value_table_bank1"),
            VE_value_table_bank2: extract("VE_value_table_bank2"), 
            Cold_advance: extract("Cold_advance"),
            Rate_of_change_of_TPS: extract("Rate_of_change_of_TPS"), 
            Rate_of_change_of_RPM: extract("Rate_of_change_of_RPM"),
            Sync_loss_counter: extract("Sync_loss_counter"), 
            Sync_loss_reason_code: extract("Sync_loss_reason_code"),
            Average_fuel_flow: extract("Average_fuel_flow"),
            Distance: extract("Distance"),
            Acceleration_on_X_axis: extract("Acceleration_on_X_axis"), 
            Acceleration_on_Y_axis: extract("Acceleration_on_Y_axis"),
            Acceleration_on_Z_axis: extract("Acceleration_on_Z_axis"), 
            
            Acceleration_on_X_axis_RAW: extract("Acceleration_on_X_axis_RAW"), 
            Acceleration_on_Y_axis_RAW: extract("Acceleration_on_Y_axis_RAW"),
            Acceleration_on_Z_axis_RAW: extract("Acceleration_on_Z_axis_RAW"), 
            Lap_Times: extract("Lap_Times"),
            
            Main_pulsewidth_bank1: [],
            Main_pulsewidth_bank2: [],
        };

        out.Gates_times = fileData?.Gates_times || { timestamps: [], lap_data: [] };
        return out;
    }, [rawData, fileData]);

    // 2. Select Source: Use New Parsed Data if available, otherwise use Context Data
    const baseSeries = useMemo(() => {
        if (parsedData) return parsedData;
        if (telemetryData && Object.keys(telemetryData).length > 0) return telemetryData;
        return {};
    }, [parsedData, telemetryData]);

    // 3. Smooth, Align GPS Points to Track Boundaries & Safely Merge Sector Gates
    const allSeries = useMemo(() => {
        if (!baseSeries || Object.keys(baseSeries).length === 0) return {};

        const rawGatesTimes = fileData?.Gates_times || baseSeries.Gates_times || { timestamps: [], lap_data: [] };

        if (!baseSeries.GPS_Latitude?.length || !baseSeries.GPS_Longitude?.length) {
            return {
                ...baseSeries,
                Gates_times: resolveGatesTimes(rawGatesTimes, [])
            };
        }

        const smoothed = smoothGpsSeries(baseSeries.GPS_Latitude, baseSeries.GPS_Longitude);
        const { latSeries, lonSeries } = geoData
            ? alignGpsSeriesToTrack(smoothed.latSeries, smoothed.lonSeries, geoData)
            : smoothed;

        const crossings = gatesData && gatesData.length > 0
            ? detectGateCrossings(latSeries, lonSeries, gatesData, 12.0)
            : [];

        const updatedGatesTimes = resolveGatesTimes(rawGatesTimes, crossings);

        return {
            ...baseSeries,
            GPS_Latitude: latSeries,
            GPS_Longitude: lonSeries,
            Gates_times: updatedGatesTimes
        };
    }, [baseSeries, fileData?.Gates_times, geoData, gatesData]);

    const lapRows = allSeries.Gates_times?.lap_data || [];

    // 4. Save to Context (Single synchronized effect)
    useEffect(() => {
        if (allSeries && Object.keys(allSeries).length > 0 && currentSession?.id) {
            setTelemetryData(allSeries);
            setSessionInfo(currentSession);
        }
    }, [allSeries, currentSession, setTelemetryData, setSessionInfo]);

    const gatesArray = useMemo(() => {
        const laps = allSeries.Gates_times?.lap_data;
        const timeRef = allSeries.ECU_time || allSeries.GPS_Speed;

        if (!laps || !timeRef || timeRef.length === 0) return [];

        const segments = [];
        const sessionStart = timeRef[0][0]; 
        const sessionEnd = timeRef[timeRef.length - 1][0];

        const firstLapStart = laps[0]?.S0;
        if (firstLapStart && firstLapStart > sessionStart) {
            segments.push({
                label: "Pre-Session / Out Lap",
                startTime: sessionStart,
                endTime: firstLapStart
            });
        }

        laps.forEach((lap, index) => {
            segments.push({
                label: `Lap ${index + 1}`,
                startTime: lap.S0,
                endTime: lap.S3 || lap.ts
            });
        });

        const lastLap = laps[laps.length - 1];
        const lastLapEnd = lastLap?.S3 || lastLap?.ts;

        if (lastLapEnd && sessionEnd > lastLapEnd) {
            segments.push({
                label: "Post-Session / In Lap",
                startTime: lastLapEnd,
                endTime: sessionEnd
            });
        }

        return segments.map((seg, i) => ({ ...seg, index: i }));
    }, [allSeries]);

    const availableTurns = useMemo(() => {
        const laps = allSeries.Gates_times?.lap_data;
        if (!laps || laps.length === 0) return [];
        const turns = new Set();
        laps.forEach(lap => {
            Object.keys(lap).forEach(key => {
                if (key.startsWith("T")) {
                    const baseName = key.replace(/ IN$/, "").replace(/ OUT$/, "");
                    turns.add(baseName);
                }
            });
        });
        
        return Array.from(turns).sort((a, b) => {
            const numA = parseInt(a.match(/\d+/)?.[0] || 0);
            const numB = parseInt(b.match(/\d+/)?.[0] || 0);
            return numA - numB;
        });
    }, [allSeries]);

    // ---------- FILTERING ----------
    const filtered = useMemo(() => {
        let timeWindows = [];
        let isFiltering = false;

        const lapsData = allSeries.Gates_times?.lap_data || [];

        // CASE 1: A Turn is selected
        if (selectedTurn) {
            isFiltering = true;

            const chosenSegment = selectedLap !== null ? gatesArray[selectedLap] : null;
            const isLapSegment = chosenSegment && /^Lap\s+\d+$/i.test(chosenSegment.label);

            if (selectedLap !== null && !isLapSegment) {
                timeWindows = [];
            } else {
                const lapsToCheck = isLapSegment
                    ? [lapsData.find((l) => l && chosenSegment.startTime <= l.S0 && l.S0 <= chosenSegment.endTime) || lapsData[selectedLap]].filter(Boolean)
                    : lapsData;

                lapsToCheck.forEach((lap) => {
                    if (!lap) return;
                    const timeIn = lap[`${selectedTurn} IN`] ?? lap[`${selectedTurn}_IN`];
                    const timeOut = lap[`${selectedTurn} OUT`] ?? lap[`${selectedTurn}_OUT`];

                    if (timeIn != null && timeOut != null) {
                        timeWindows.push({ min: Math.min(timeIn, timeOut), max: Math.max(timeIn, timeOut) });
                    } else if (timeIn != null) {
                        timeWindows.push({ min: timeIn, max: timeIn + 3000 });
                    } else if (timeOut != null) {
                        timeWindows.push({ min: timeOut - 3000, max: timeOut });
                    }
                });
            }
        }
        // CASE 2: Only a Lap is selected (No Turn)
        else if (selectedLap !== null && gatesArray[selectedLap]) {
            isFiltering = true;
            timeWindows.push({
                min: gatesArray[selectedLap].startTime,
                max: gatesArray[selectedLap].endTime
            });
        } 
        // CASE 3: Only the Stint/Timestamp is selected
        else if (selectedTs) {
            isFiltering = true;
            timeWindows.push({
                min: Number(selectedTs.startTime),
                max: Number(selectedTs.endTime)
            });
        }

        if (!isFiltering) return allSeries;

        const newFiltered = {};
        
        Object.keys(allSeries).forEach(key => {
            if (key === "Gates_times") {
                newFiltered[key] = allSeries[key];
                return;
            }

            const seriesData = allSeries[key];

            if (Array.isArray(seriesData)) {
                if (timeWindows.length === 0) {
                    newFiltered[key] = [];
                } else {
                    newFiltered[key] = seriesData.filter(pt => {
                        const t = pt[0]; 
                        return timeWindows.some(w => t >= w.min && t <= w.max);
                    });
                }
            } else {
                newFiltered[key] = seriesData;
            }
        });

        return newFiltered;
    }, [allSeries, selectedLap, selectedTs, gatesArray, selectedTurn]);

    // ==========================================
    // 2. VIEW HELPERS
    // ==========================================
    const mapData = useMemo(() => {
        if (!filtered.GPS_Longitude || filtered.GPS_Longitude.length === 0) return [];
        return filtered.GPS_Longitude.map((pt, i) => [
            pt[1],
            filtered.GPS_Latitude[i] ? filtered.GPS_Latitude[i][1] : 0,
            filtered.GPS_Speed[i] ? filtered.GPS_Speed[i][1] : 0,
            pt[0]
        ]).filter(p => p[0] !== 0 && p[1] !== 0);
    }, [filtered.GPS_Longitude, filtered.GPS_Latitude, filtered.GPS_Speed]);

    const speedVsDistance = useMemo(() => {
        const distData = filtered.Distance;
        const speedData = filtered.GPS_Speed;

        if (!distData || !speedData || distData.length === 0 || speedData.length === 0) {
            return { dist: [], speed: [] };
        }

        const distOut = [];
        const speedOut = [];
        let distIdx = 0;
        
        for (let i = 0; i < speedData.length; i++) {
            const [tSpeed, valSpeed] = speedData[i];

            while (distIdx < distData.length - 1 && distData[distIdx][0] < tSpeed) {
                distIdx++;
            }

            const [tDist, valDist] = distData[distIdx];
            
            if (Math.abs(tDist - tSpeed) < 0.1) {
                distOut.push(valDist);
                speedOut.push(valSpeed);
            }
        }

        return { dist: distOut, speed: speedOut };
    }, [filtered.Distance, filtered.GPS_Speed]);

    // UI Helpers
    const timeStamps = (arr) => arr ? arr.map(pt => pt[0]) : [];
    const toMsArr = (arr) => arr; 

    // Chart Builder Logic
    const normalizePairs = (pairs = []) => pairs.map(([t, v]) => [t, Number(v)]).filter(p => !isNaN(p[1]));

    const SIGNAL_SPECS = [
        ["Engine RPM", "RPM", "RPM"], ["GPS Speed", "GPS_Speed", "km/h"], ["Throttle", "Throttle_position", "%"],
        ["Battery", "Battery_voltage", "V"], ["Coolant Temp", "Coolant_temperature", "°C"],
        ["Manifold Pressure", "Manifold_air_pressure", "kPa"], ["Manifold Temp", "Manifold_air_temperature", "°C"],
        ["Gear", "Gear", "-"], ["Brake Pressure", "Brake_Pressure", "Bar"], ["Steering Angle", "Steering_Angle", "deg"],
        ["BSPD", "BSPD", "-"],
       
        ["Damper FL", "Damper_Left_Front", "cm"], ["Damper FR", "Damper_Right_Front", "cm"],
        ["Damper RL", "Damper_Left_Rear", "cm"], ["Damper RR", "Damper_Right_Rear", "cm"],
        ["Air Density Corr.", "Air_density_correction", "%"], ["Warmup Corr.", "Warmup_correction", "%"],
        ["TPS Accel", "TPS_based_acceleration", "%"], ["TPS Fuel Cut", "TPS_based_fuel_cut", "%"],
        ["Total Fuel Corr.", "Total_fuel_correction", "%"], ["Cold Advance", "Cold_advance", "deg"],
        ["VE Table 1", "VE_value_table_bank1", "%"], ["VE Table 2", "VE_value_table_bank2", "%"],
        ["TPS Rate", "Rate_of_change_of_TPS", "%/s"], ["RPM Rate", "Rate_of_change_of_RPM", "RPM/s"],
        ["Sync Loss Count", "Sync_loss_counter", "cnt"], ["Sync Loss Reason", "Sync_loss_reason_code", "code"],
        ["Avg Fuel Flow", "Average_fuel_flow", "cc/min"],

        ["Accel X", "Acceleration_on_X_axis", "G"], 
        ["Accel Y", "Acceleration_on_Y_axis", "G"],
        ["Accel Z", "Acceleration_on_Z_axis", "G"],

        ["Accel X (RAW)", "Acceleration_on_X_axis_RAW", "G"], 
        ["Accel Y (RAW)", "Acceleration_on_Y_axis_RAW", "G"],
        ["Accel Z (RAW)", "Acceleration_on_Z_axis_RAW", "G"],

        ["Gyro X (RAW)", "Gyroscope_on_X_axis", "rad/s"],
        ["Gyro Y (RAW)", "Gyroscope_on_Y_axis", "rad/s"], 
        ["Gyro Z (RAW)", "Gyroscope_on_Z_axis", "rad/s"],
    ];

    const signalsCatalog = useMemo(() => {
        const out = {};
        for (const [label, key, unit] of SIGNAL_SPECS) {
            if (filtered[key] && filtered[key].length > 0) {
                out[label] = { unit, pairs: normalizePairs(filtered[key]) };
            }
        }
        return out;
    }, [filtered]);

    const available = Object.keys(signalsCatalog).filter(k => !staged.includes(k));
    const addPicked = () => { if (pick && staged.length < MAX_SIGNALS) setStaged(prev => [...prev, pick]); setPick(""); };
    const removeStaged = (key) => setStaged(prev => prev.filter(k => k !== key));
    const createChart = () => setCommitted(staged);
    const clearChart = () => setCommitted([]);

    // ==========================================
    // 3. RENDER
    // ==========================================
    return (
        <div className="p-4 space-y-6">
            {/* Timestamp selector */}
            <div className="rounded-lg bg-white p-4 shadow space-y-2">
                <h3 className="font-medium text-gray-700">Choose Timestamp</h3>
                <TimestampSelect 
                    sessionId={activeSessionId} 
                    onSelect={(ts) => {
                        setSelectedTs(ts);
                        setSelectedLap(null);
                    }} 
                />
                
                {/* Driver & Stint Details Panel */}
                {selectedTs && (
                    <div className="mt-3 p-3 bg-gray-50 rounded-md border border-gray-200 text-sm space-y-1">
                        <div className="flex justify-between">
                            <span className="text-gray-500">Driver:</span>
                            <span className="font-medium text-indigo-700">
                                {driversMap[selectedTs.driverId] || (selectedTs.driverId ? `ID: ${selectedTs.driverId}` : "No driver linked")}
                            </span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-gray-500">Stint Time:</span>
                            <span className="font-medium text-gray-900">
                                {((selectedTs.endTime - selectedTs.startTime) / 1000).toFixed(1)}s
                            </span>
                        </div>
                    </div>
                )}
            </div>

            {/* Lap selector */}
            <div className="rounded-lg bg-white p-4 shadow">
                <h3 className="font-medium text-gray-700 mb-2">Choose Lap</h3>
                <select
                    className="w-full border-gray-300 rounded-md"
                    value={selectedLap ?? ""}
                    onChange={(e) => setSelectedLap(e.target.value === "" ? null : Number(e.target.value))}
                >
                    <option value="">All laps</option>
                    {gatesArray.map((g, i) => (
                        <option key={i} value={i}>{g.label}</option>
                    ))}
                </select>
            </div>

            {/* Turn selector */}
            <div className="rounded-lg bg-white p-4 shadow">
                <h3 className="font-medium text-gray-700 mb-2">Choose Turn</h3>
                <select
                    className="w-full border-gray-300 rounded-md"
                    value={selectedTurn ?? ""}
                    onChange={(e) => setSelectedTurn(e.target.value === "" ? null : e.target.value)}
                >
                    <option value="">All turns</option>
                    {availableTurns.map((t, i) => (
                        <option key={i} value={t}>{t}</option>
                    ))}
                </select>
            </div>

            {/* Map & Lap Times */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 h-[500px]">
                {/* Map Container (Takes 2/3 width) */}
                <div className="bg-white p-4 rounded-lg shadow lg:col-span-2 relative flex flex-col min-w-0">
                    <h3 className="text-lg font-medium text-gray-900 text-center mb-2">Track Map</h3>
                    <div className="flex-grow relative border border-gray-100 rounded bg-gray-50 overflow-hidden">
                        {geoData ? (
                            <MapChart
                                geoData={geoData}
                                data={mapData}
                                gates={gatesData}
                                width="100%"
                                height="100%"
                            />
                        ) : (
                            <div className="flex h-full items-center justify-center text-gray-400">
                                No Track Data
                            </div>
                        )}
                    </div>
                </div>

                {/* Lap Times Panel (Takes 1/3 width) */}
                <div className="bg-white rounded-lg shadow lg:col-span-1 flex flex-col overflow-hidden min-w-0">
                    <LapTimesPanel
                        laps={lapRows}
                        title="Lap Times"
                        className="w-full h-full border-0 shadow-none"
                    />
                </div>
            </div>

            {/* Chart Builder */}
            <div className="rounded-lg bg-white p-4 shadow">
                <div className="mb-3 flex items-center gap-3">
                    <h3 className="font-medium text-gray-700">Build your own chart</h3>

                    <div className="ml-auto flex items-center gap-2">
                        <label className="text-sm text-gray-600">Add signal:</label>
                        <select
                            className="border rounded px-2 py-1 text-sm"
                            value={pick}
                            onChange={(e) => setPick(e.target.value)}
                        >
                            <option value="" disabled>
                                {available.length ? "Choose…" : "No more"}
                            </option>
                            {available.map((k) => (
                                <option key={k} value={k}>{k}</option>
                            ))}
                        </select>

                        <button
                            className="rounded bg-blue-600 text-white text-sm px-3 py-1 disabled:opacity-50"
                            onClick={addPicked}
                            disabled={!pick || staged.length >= MAX_SIGNALS}
                        >
                            Add
                        </button>

                        <div className="mx-2 h-5 w-px bg-gray-300" />

                        <button
                            className="rounded bg-emerald-600 text-white text-sm px-3 py-1 disabled:opacity-50"
                            onClick={createChart}
                            disabled={!staged.length}
                        >
                            Create chart
                        </button>

                        <button
                            className="rounded border border-gray-300 text-gray-700 text-sm px-3 py-1 disabled:opacity-50"
                            onClick={clearChart}
                            disabled={!committed.length}
                        >
                            Clear
                        </button>

                        <span className="text-xs text-gray-500 tabular-nums">{staged.length}/{MAX_SIGNALS}</span>
                    </div>
                </div>

                <div className="mb-3 flex flex-wrap gap-2">
                    {staged.map((k) => (
                        <span key={k} className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-1 text-xs text-gray-700">
                            {k}
                            <button
                                className="ml-1 rounded px-1 text-gray-500 hover:text-gray-800"
                                onClick={() => removeStaged(k)}
                            >
                                ×
                            </button>
                        </span>
                    ))}
                    {!staged.length && (
                        <span className="text-xs text-gray-400">Pick up to {MAX_SIGNALS} signals, then press “Create chart”.</span>
                    )}
                </div>

                {!!committed.length && (
                    <AutoPairChart
                        align="base-fastest"
                        alignMethod="linear"
                        toleranceMs={1000}
                        series={committed.map((label) => ({
                            name: label,
                            unit: signalsCatalog[label].unit,
                            pairs: signalsCatalog[label].pairs, 
                        }))}
                        height={320}
                    />
                )}
            </div>

            {selectedLap != null && (
                <div className="rounded-lg bg-white p-4 shadow">
                    <h3 className="font-medium text-gray-700 mb-2">
                        Speed vs Distance (Lap {selectedLap})
                    </h3>
                    <VitalChart_distance
                        distance={speedVsDistance.dist}
                        series={[{ name: "Speed", data: speedVsDistance.speed, unit: "km/h" }]}
                        height={300}
                    />
                </div>
            )}

            {/* Speed vs Time */}
            <div className="rounded-lg bg-white p-4 shadow">
                <h3 className="font-medium text-gray-700 mb-2">Speed vs Time</h3>
                <VitalChart
                    dateTime={timeStamps(filtered.GPS_Speed)}
                    series={[{ name: "Speed", data: (filtered.GPS_Speed || []).map(([, v]) => v), unit: "km/h" }]}
                    height={300}
                />
            </div>

            {/* Throttle & Speed & RPM vs Time */}
            <div className="rounded-lg bg-white p-4 shadow">
                <h3 className="font-medium text-gray-700 mb-2">Throttle & Speed & RPM vs Time</h3>
                <AutoPairChart
                    align="base-fastest"
                    alignMethod="linear"
                    toleranceMs={1000}
                    series={[
                        {
                            name: "Throttle", unit: "%",
                            time: timeStamps(filtered.Throttle_position),
                            data: (filtered.Throttle_position || []).map(([, v]) => v),
                        },
                        {
                            name: "Speed", unit: "km/h",
                            time: timeStamps(filtered.GPS_Speed),
                            data: (filtered.GPS_Speed || []).map(([, v]) => v),
                        },
                        {
                            name: "RPM", unit: "RPM",
                            time: timeStamps(filtered.RPM),
                            data: (filtered.RPM || []).map(([, v]) => v),
                        },
                        {
                            name: "Coolant temp", unit: "°C",
                            time: toMsArr(timeStamps(filtered.Coolant_temperature)), 
                            data: (filtered.Coolant_temperature || []).map(([, v]) => v),
                        },
                    ]}
                    height={300}
                />
            </div>

            {/* 118 (Accel XYZ) */}
            <div className="rounded-lg bg-white p-4 shadow">
                <h3 className="font-medium text-gray-700 mb-2">118 (Acceleration)</h3>
                <AutoPairChart
                    align="base-fastest"
                    alignMethod="linear"
                    toleranceMs={100}
                    height={300}
                    series={[
                        {
                            name: "Accel X", unit: "G",
                            time: timeStamps(filtered.Acceleration_on_X_axis_RAW),
                            data: filtered.Acceleration_on_X_axis_RAW?.map(pt => pt[1]) || []
                        },
                        {
                            name: "Accel Y", unit: "G",
                            time: timeStamps(filtered.Acceleration_on_Y_axis_RAW),
                            data: filtered.Acceleration_on_Y_axis_RAW?.map(pt => pt[1]) || []
                        },
                        {
                            name: "Accel Z", unit: "G",
                            time: timeStamps(filtered.Acceleration_on_Z_axis_RAW),
                            data: filtered.Acceleration_on_Z_axis_RAW?.map(pt => pt[1]) || []
                        }
                    ]}
                />
            </div>

            {/* 119 (Gyro XYZ) */}
            <div className="rounded-lg bg-white p-4 shadow">
                <h3 className="font-medium text-gray-700 mb-2">119 (Gyroscope)</h3>
                <AutoPairChart
                    align="base-fastest"
                    alignMethod="linear"
                    toleranceMs={100}
                    height={300}
                    series={[
                        {
                            name: "Gyro X", unit: "rad/s",
                            time: timeStamps(filtered.Gyroscope_on_X_axis),
                            data: filtered.Gyroscope_on_X_axis?.map(pt => pt[1]) || []
                        },
                        {
                            name: "Gyro Y", unit: "rad/s",
                            time: timeStamps(filtered.Gyroscope_on_Y_axis),
                            data: filtered.Gyroscope_on_Y_axis?.map(pt => pt[1]) || []
                        },
                        {
                            name: "Gyro Z", unit: "rad/s",
                            time: timeStamps(filtered.Gyroscope_on_Z_axis),
                            data: filtered.Gyroscope_on_Z_axis?.map(pt => pt[1]) || []
                        }
                    ]}
                />
            </div>
        </div>
    );
}