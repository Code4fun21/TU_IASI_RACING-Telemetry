import { CANDecoderV2 } from "../../../services/CANDecoder_V2";
import {
    integrateDistance,
    computeCombinedG,
    computeBrakeBias,
    detectSensorAnomalies
} from "../dsp/mathEngine";

export const SANDBOX_STORAGE_KEYS = {
    SESSION_ID: "sandbox_selected_session_id",
    ACTIVE_TAB: "sandbox_active_tab",
    RECIPES: "sandbox_filter_recipes_v1",
    X_AXIS_MODE: "sandbox_x_axis_mode"
};

export const CHANNEL_CATALOG = {
    GPS_Speed: { label: "GPS Speed", unit: "km/h", aliases: ["GPS_Speed", "gpsSpeed"] },
    GPS_Latitude: { label: "GPS Latitude", unit: "deg", aliases: ["GPS_Latitude"] },
    GPS_Longitude: { label: "GPS Longitude", unit: "deg", aliases: ["GPS_Longitude"] },
    Distance: { label: "Session Distance", unit: "m", aliases: ["Distance"] },
    Lap_Distance: { label: "Lap Distance", unit: "m", aliases: ["Lap_Distance"] },
    lapTime: { label: "Lap Time", unit: "ms", aliases: ["lapTime", "Lap_Times"] },
    RPM: { label: "Engine RPM", unit: "RPM", aliases: ["RPM", "rpm"] },
    Throttle_position: { label: "Throttle", unit: "%", aliases: ["Throttle_position", "throttlePosition"] },
    Brake_Pressure: { label: "Brake Pressure", unit: "bar", aliases: ["Brake_Pressure", "brakePressure"] },
    brakePressure_RAW: { label: "Brake Pressure (RAW)", unit: "adc", aliases: ["brakePressure_RAW"] },
    Brake_Front: { label: "Brake Front", unit: "bar", aliases: ["Brake_Front", "brakeFront"] },
    Brake_Rear: { label: "Brake Rear", unit: "bar", aliases: ["Brake_Rear", "brakeRear"] },
    Steering_Angle: { label: "Steering Angle", unit: "deg", aliases: ["Steering_Angle", "steering"] },
    Gear: { label: "Gear", unit: "-", discrete: true, aliases: ["Gear", "gear"] },
    BSPD: { label: "BSPD", unit: "-", aliases: ["BSPD", "bspd"] },
    Battery_voltage: { label: "Battery", unit: "V", aliases: ["Battery_voltage", "batteryVoltage"] },
    Coolant_temperature: { label: "Coolant Temp", unit: "°C", aliases: ["Coolant_temperature", "coolantTemp"] },
    Manifold_air_pressure: { label: "Manifold Pressure", unit: "kPa", aliases: ["Manifold_air_pressure", "manifoldAirPressure"] },
    Manifold_air_temperature: { label: "Manifold Temp", unit: "°C", aliases: ["Manifold_air_temperature", "manifoldAirTemp"] },
    Acceleration_on_X_axis: { label: "Accel X", unit: "G", aliases: ["Acceleration_on_X_axis", "accelerationX"] },
    Acceleration_on_Y_axis: { label: "Accel Y", unit: "G", aliases: ["Acceleration_on_Y_axis", "accelerationY"] },
    Acceleration_on_Z_axis: { label: "Accel Z", unit: "G", aliases: ["Acceleration_on_Z_axis", "accelerationZ"] },
    Acceleration_on_X_axis_RAW: { label: "Accel X (RAW)", unit: "G", aliases: ["Acceleration_on_X_axis_RAW", "accelerationX_RAW"] },
    Acceleration_on_Y_axis_RAW: { label: "Accel Y (RAW)", unit: "G", aliases: ["Acceleration_on_Y_axis_RAW", "accelerationY_RAW"] },
    Acceleration_on_Z_axis_RAW: { label: "Accel Z (RAW)", unit: "G", aliases: ["Acceleration_on_Z_axis_RAW", "accelerationZ_RAW"] },
    Gyroscope_on_X_axis: { label: "Gyro X", unit: "rad/s", aliases: ["Gyroscope_on_X_axis", "gyroX"] },
    Gyroscope_on_Y_axis: { label: "Gyro Y", unit: "rad/s", aliases: ["Gyroscope_on_Y_axis", "gyroY"] },
    Gyroscope_on_Z_axis: { label: "Gyro Z", unit: "rad/s", aliases: ["Gyroscope_on_Z_axis", "gyroZ"] },
    gyroX_RAW: { label: "Gyro X (RAW)", unit: "rad/s", aliases: ["gyroX_RAW"] },
    gyroY_RAW: { label: "Gyro Y (RAW)", unit: "rad/s", aliases: ["gyroY_RAW"] },
    gyroZ_RAW: { label: "Gyro Z (RAW)", unit: "rad/s", aliases: ["gyroZ_RAW"] },
    Damper_Left_Front: { label: "Damper FL", unit: "cm", aliases: ["Damper_Left_Front", "damperLF"] },
    Damper_Right_Front: { label: "Damper FR", unit: "cm", aliases: ["Damper_Right_Front", "damperRF"] },
    Damper_Left_Rear: { label: "Damper RL", unit: "cm", aliases: ["Damper_Left_Rear", "damperLR"] },
    Damper_Right_Rear: { label: "Damper RR", unit: "cm", aliases: ["Damper_Right_Rear", "damperRR"] },
    damperLF_RAW: { label: "Damper FL (RAW)", unit: "adc", aliases: ["damperLF_RAW"] },
    damperRF_RAW: { label: "Damper FR (RAW)", unit: "adc", aliases: ["damperRF_RAW"] },
    damperLR_RAW: { label: "Damper RL (RAW)", unit: "adc", aliases: ["damperLR_RAW"] },
    damperRR_RAW: { label: "Damper RR (RAW)", unit: "adc", aliases: ["damperRR_RAW"] },
    Combined_G: { label: "Combined G-Force", unit: "G", aliases: ["Combined_G"] },
    Brake_Bias: { label: "Front Brake Bias", unit: "%", aliases: ["Brake_Bias"] }
};

export function buildDerivedLabel(recipe, baseLabels = {}) {
    const srcLabel = baseLabels[recipe.sourceKey] || recipe.sourceKey;
    if (recipe.kind === "TARE") return `${srcLabel} (Tared)`;
    if (recipe.kind === "DERIVATIVE") return `${srcLabel} Velocity`;
    if (recipe.kind === "MATLAB") {
        return recipe.outputKey.replace(/^Math_/, "").replace(/_/g, " ");
    }
    return `${srcLabel} (${recipe.filterType})`;
}

export const CHART_REQUIREMENTS = [
    { id: "multi_trace", label: "Synchronized Multi-Trace", requiredAny: ["GPS_Speed", "RPM", "Acceleration_on_X_axis", "Throttle_position"] },
    { id: "gg_circle", label: "G-G Traction Circle", requiredAll: ["Acceleration_on_X_axis", "Acceleration_on_Y_axis"] },
    { id: "track_map", label: "2D GPS Track Heatmap", requiredAll: ["GPS_Latitude", "GPS_Longitude"] },
    { id: "filter_overlay", label: "Filter & Residual Overlay", requiredAny: ["Acceleration_on_X_axis", "Damper_Left_Front", "RPM", "GPS_Speed"] },
    { id: "fft_spectrum", label: "FFT Frequency Spectrum", requiredAny: ["Acceleration_on_X_axis", "Acceleration_on_Z_axis", "Damper_Left_Front", "RPM"] },
    { id: "damper_hist", label: "Damper Velocity Histogram", requiredAny: ["Damper_Left_Front", "Damper_Right_Front", "Damper_Left_Rear", "Damper_Right_Rear"] },
    { id: "custom_xy", label: "Custom XY Scatter", requiredAny: ["GPS_Speed", "RPM", "Acceleration_on_X_axis", "Steering_Angle"] },
    { id: "lap_overlay", label: "Distance Lap Overlay", requiredAll: ["Distance"], requiresLaps: true }
];

export function evaluateChartAvailability(channelsMap, gatesData) {
    const availableKeys = new Set(Object.keys(channelsMap || {}));
    const hasLaps = Array.isArray(gatesData?.lap_data) && gatesData.lap_data.length > 0;
    const status = {};

    for (const req of CHART_REQUIREMENTS) {
        let enabled = true;
        let reason = "";

        if (req.requiredAll) {
            const missing = req.requiredAll.filter((k) => !availableKeys.has(k));
            if (missing.length > 0) {
                enabled = false;
                reason = `Missing sensors: ${missing.join(", ")}`;
            }
        }
        if (enabled && req.requiredAny) {
            const found = req.requiredAny.some((k) => availableKeys.has(k));
            if (!found) {
                enabled = false;
                reason = `Requires one of: ${req.requiredAny.join(", ")}`;
            }
        }
        if (enabled && req.requiresLaps && !hasLaps) {
            enabled = false;
            reason = "Requires at least 1 detected lap gate crossing";
        }

        status[req.id] = { enabled, reason };
    }
    return status;
}

function toMsTimestamp(val) {
    const n = Number(val);
    if (!Number.isFinite(n)) return NaN;
    return n < 2e10 ? n * 1000 : n;
}

export async function parseRawCanHexLog(rawText, trackData = null) {
    const decoder = new CANDecoderV2();
    if (trackData) {
        await decoder.setBaseCoordinates(trackData);
    }

    const lines = rawText.split(/\r?\n/);
    const rows = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line || line.startsWith("#") || line.startsWith("timestamp")) continue;
        const decoded = decoder.parse(line);
        if (decoded) {
            if (decoded.gear === "N") decoded.gear = 0;
            else if (typeof decoded.gear === "string") decoded.gear = Number(decoded.gear) || 0;
            rows.push(decoded);
        }
    }

    return {
        rows,
        Gates_times: decoder.getGatesData()
    };
}

export function buildTypedTelemetryStore(fileData, timeWindow = null) {
    const rawRows = Array.isArray(fileData?.rows)
        ? fileData.rows
        : Array.isArray(fileData)
        ? fileData
        : [];

    const gatesData = fileData?.Gates_times || { timestamps: [], lap_data: [] };
    if (rawRows.length === 0) {
        return {
            timeMs: new Float64Array(0),
            fs: 50,
            rawChannels: {},
            units: {},
            labels: {},
            anomalies: {},
            gatesData
        };
    }

    const perChannelSparse = {};
    const aliasToCanonical = {};

    Object.entries(CHANNEL_CATALOG).forEach(([canonical, meta]) => {
        meta.aliases.forEach((alias) => {
            aliasToCanonical[alias] = canonical;
        });
    });

    for (let i = 0; i < rawRows.length; i++) {
        const row = rawRows[i];
        const ts = toMsTimestamp(row.timestamp ?? row.ECU_time);
        if (!Number.isFinite(ts)) continue;
        if (timeWindow && (ts < timeWindow.min || ts > timeWindow.max)) continue;

        const keys = Object.keys(row);
        for (let k = 0; k < keys.length; k++) {
            const rawKey = keys[k];
            if (rawKey === "timestamp" || rawKey === "canId" || rawKey === "ECU_time") continue;
            const canonical = aliasToCanonical[rawKey] || rawKey;
            const rawVal = row[rawKey];
            if (rawVal === null || rawVal === undefined || rawVal === "") continue;
            const numVal = rawVal === "N" ? 0 : Number(rawVal);
            if (!Number.isFinite(numVal)) continue;

            if (!perChannelSparse[canonical]) perChannelSparse[canonical] = [];
            perChannelSparse[canonical].push([ts, numVal]);
        }
    }

    const channelKeys = Object.keys(perChannelSparse);
    if (channelKeys.length === 0) {
        return {
            timeMs: new Float64Array(0),
            fs: 50,
            rawChannels: {},
            units: {},
            labels: {},
            anomalies: {},
            gatesData
        };
    }

    let minTs = Infinity;
    let maxTs = -Infinity;
    const sampleRates = [];

    channelKeys.forEach((key) => {
        const pts = perChannelSparse[key];
        pts.sort((a, b) => a[0] - b[0]);
        if (pts[0][0] < minTs) minTs = pts[0][0];
        if (pts[pts.length - 1][0] > maxTs) maxTs = pts[pts.length - 1][0];

        if (pts.length > 2) {
            const spanSec = (pts[pts.length - 1][0] - pts[0][0]) / 1000;
            if (spanSec > 0) {
                sampleRates.push(pts.length / spanSec);
            }
        }
    });

    sampleRates.sort((a, b) => a - b);
    const detectedFs = sampleRates.length
        ? Math.max(10, Math.min(200, Math.round(sampleRates[Math.floor(sampleRates.length * 0.75)])))
        : 50;

    const dtMs = 1000 / detectedFs;
    const totalSamples = Math.min(250000, Math.max(2, Math.floor((maxTs - minTs) / dtMs) + 1));
    const timeMs = new Float64Array(totalSamples);
    for (let i = 0; i < totalSamples; i++) {
        timeMs[i] = minTs + i * dtMs;
    }

    const rawChannels = {};
    const units = {};
    const labels = {};
    const anomalies = {};

    channelKeys.forEach((key) => {
        const pts = perChannelSparse[key];
        const meta = CHANNEL_CATALOG[key];
        const isDiscrete = Boolean(meta?.discrete);
        const arr = new Float64Array(totalSamples);

        let effectivePts = pts;
        if (key === "Distance" && pts.length > 1) {
            effectivePts = [pts[0]];
            for (let p = 1; p < pts.length; p++) {
                if (pts[p][1] !== pts[p - 1][1]) {
                    effectivePts.push(pts[p]);
                }
            }
        }

        let ptr = 0;
        for (let i = 0; i < totalSamples; i++) {
            const t = timeMs[i];
            while (ptr < effectivePts.length - 1 && effectivePts[ptr + 1][0] <= t) {
                ptr++;
            }

            if (ptr >= effectivePts.length - 1 || isDiscrete) {
                arr[i] = effectivePts[ptr][1];
            } else {
                const [t0, v0] = effectivePts[ptr];
                const [t1, v1] = effectivePts[ptr + 1];
                const span = t1 - t0;
                if (span > 0 && span < 5000 && t >= t0) {
                    const alpha = (t - t0) / span;
                    arr[i] = v0 + alpha * (v1 - v0);
                } else {
                    arr[i] = v0;
                }
            }
        }

        rawChannels[key] = arr;
        units[key] = meta?.unit || "-";
        labels[key] = meta?.label || key;
        anomalies[key] = detectSensorAnomalies(
            Float64Array.from(pts.map((p) => p[0])),
            Float64Array.from(pts.map((p) => p[1]))
        );
    });

    if (rawChannels.GPS_Speed) {
        const lapStarts = (gatesData.lap_data || []).map((l) => toMsTimestamp(l.S0)).filter(Number.isFinite);
        const { sessionDist, lapDist } = integrateDistance(timeMs, rawChannels.GPS_Speed, lapStarts);
        if (rawChannels.Distance) {
            rawChannels.GPS_Raw_Distance = rawChannels.Distance;
            units.GPS_Raw_Distance = "m";
            labels.GPS_Raw_Distance = "GPS Gate Distance (Stepped)";
        }
        rawChannels.Distance = sessionDist;
        units.Distance = "m";
        labels.Distance = "Session Distance";
        rawChannels.Lap_Distance = lapDist;
        units.Lap_Distance = "m";
        labels.Lap_Distance = "Lap Distance";
    }

    if (rawChannels.GPS_Speed) {
        const lapStarts = (gatesData.lap_data || []).map((l) => toMsTimestamp(l.S0)).filter(Number.isFinite);
        const { sessionDist, lapDist } = integrateDistance(timeMs, rawChannels.GPS_Speed, lapStarts);
        if (!rawChannels.Distance) {
            rawChannels.Distance = sessionDist;
            units.Distance = "m";
            labels.Distance = "Session Distance";
        }
        rawChannels.Lap_Distance = lapDist;
        units.Lap_Distance = "m";
        labels.Lap_Distance = "Lap Distance";
    }

    if (rawChannels.Acceleration_on_X_axis && rawChannels.Acceleration_on_Y_axis) {
        rawChannels.Combined_G = computeCombinedG(
            rawChannels.Acceleration_on_X_axis,
            rawChannels.Acceleration_on_Y_axis
        );
        units.Combined_G = "G";
        labels.Combined_G = "Combined G-Force";
    }

    if (rawChannels.Brake_Front && rawChannels.Brake_Rear) {
        rawChannels.Brake_Bias = computeBrakeBias(rawChannels.Brake_Front, rawChannels.Brake_Rear);
        units.Brake_Bias = "%";
        labels.Brake_Bias = "Front Brake Bias";
    }

    return {
        timeMs,
        fs: detectedFs,
        rawChannels,
        units,
        labels,
        anomalies,
        gatesData
    };
}

export function loadSavedRecipes() {
    try {
        const raw = localStorage.getItem(SANDBOX_STORAGE_KEYS.RECIPES);
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

export function saveRecipesToStorage(recipes) {
    try {
        localStorage.setItem(SANDBOX_STORAGE_KEYS.RECIPES, JSON.stringify(recipes));
    } catch {
        return;
    }
}

export function exportWorkspaceJSON(recipes, meta = {}) {
    const payload = {
        version: "1.0",
        exportedAt: new Date().toISOString(),
        meta,
        recipes
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sandbox_workspace_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
}

export function exportFilteredCSV(timeMs, allChannels, selectedKeys) {
    if (!timeMs || timeMs.length === 0) return;
    const keys = selectedKeys && selectedKeys.length ? selectedKeys : Object.keys(allChannels);
    const header = ["timestamp_ms", ...keys].join(",");
    const lines = [header];

    for (let i = 0; i < timeMs.length; i++) {
        const row = [timeMs[i].toFixed(2)];
        for (let k = 0; k < keys.length; k++) {
            const arr = allChannels[keys[k]];
            row.push(arr && i < arr.length ? Number(arr[i]).toFixed(5) : "");
        }
        lines.push(row.join(","));
    }

    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sandbox_telemetry_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
}