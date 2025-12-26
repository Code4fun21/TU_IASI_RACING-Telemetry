import { useEffect, useState, useMemo, useContext } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { api } from "../services/api";
import { DriverContext } from "../context/DriverContext";

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
const ACCEL_SENS = 16384.0; // LSB per g
const GYRO_SENS = 131.0;    // LSB per deg/s
const G_TO_MS2 = 9.80665;
const DEG_TO_RAD = Math.PI / 180.0;

// --- HELPERS (File Loading) ---
const readBlobAsText = (blob) => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsText(blob);
    });
};

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

    const { fileData, session } = location.state || {};
    // Ensure rawData is an array
    const rawData = useMemo(() => {
    // If fileData is the new object format { rows: [...] }, use .rows
    if (fileData && Array.isArray(fileData.rows)) return fileData.rows;
    // Fallback for old files (just an array)
    if (Array.isArray(fileData)) return fileData;
    return [];
}, [fileData]);

    const [geoData, setGeoData] = useState(null);
    const [gatesData, setGatesData] = useState([]);
    const [selectedTs, setSelectedTs] = useState(null);
    const [selectedLap, setSelectedLap] = useState(null);

    // Chart Builder State
    const [staged, setStaged] = useState([]);
    const [pick, setPick] = useState("");
    const [committed, setCommitted] = useState([]);

    // Safety Check
    useEffect(() => {
        if (!rawData || rawData.length === 0) console.warn("No valid file data found.");
    }, [rawData]);

    // Fetch Track Assets
    useEffect(() => {
        if (!session?.trackId) return;
        let isMounted = true;
        const fetchTrackFiles = async () => {
            try {
                const track = await api.getTrackById(session.trackId);
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
    }, [session?.trackId]);

    // ---------- DATA PARSING & CONVERSION ----------
    const allSeries = useMemo(() => {
        if (rawData.length === 0) return {};

        // Helper to extract and scale data
        // targetKey: Dashboard Name, sourceKey: CSV Column Name, scaleFn: Math function
        const extract = (targetKey, scaleFn = (v) => v) => {
            const keyMap = {
                "RPM": "rpm", "Throttle_position": "throttlePosition", "Battery_voltage": "batteryVoltage",
                "Coolant_temperature": "coolantTemp", "Manifold_air_pressure": "manifoldAirPressure",
                "Manifold_air_temperature": "manifoldAirTemp", "GPS_Latitude": "GPS_Latitude",
                "GPS_Longitude": "GPS_Longitude", "GPS_Speed": "GPS_Speed", "ECU_time": "timestamp",
                
                "Acceleration_on_X_axis": "accelerationX", "Acceleration_on_Y_axis": "accelerationY", "Acceleration_on_Z_axis": "accelerationZ", 
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
            };
            const sourceKey = keyMap[targetKey] || targetKey;

            return rawData.map(row => {
                const ts = Number(row.timestamp);
                let val = null;
                
                if (targetKey === "ECU_time") {
                    val = ts;
                } else if (Object.prototype.hasOwnProperty.call(row, sourceKey)) {
                    const rawVal = row[sourceKey];
                    if (rawVal !== null && rawVal !== undefined && rawVal !== "") {
                        const num = Number(rawVal);
                        if (!isNaN(num)) {
                            val = scaleFn(num); // Apply scaling (e.g., IMU conversion)
                        }
                    }
                }
                return [ts, val];
            })
            // *** CRITICAL: Filter out nulls to prevent chart recursion crash ***
            .filter(pt => pt[1] !== null); 
        };

        // Scaling Functions (Matching Python Backend)
        const scaleAccel = (v) => (v / ACCEL_SENS) * G_TO_MS2;
        const scaleGyro = (v) => (v / GYRO_SENS) * DEG_TO_RAD;

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
            
            // Apply Math for IMU
            Acceleration_on_X_axis: extract("Acceleration_on_X_axis", scaleAccel), 
            Acceleration_on_Y_axis: extract("Acceleration_on_Y_axis", scaleAccel),
            Acceleration_on_Z_axis: extract("Acceleration_on_Z_axis", scaleAccel), 
            
            Gyroscope_on_X_axis: extract("Gyroscope_on_X_axis", scaleGyro),
            Gyroscope_on_Y_axis: extract("Gyroscope_on_Y_axis", scaleGyro), 
            Gyroscope_on_Z_axis: extract("Gyroscope_on_Z_axis", scaleGyro),
            
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
            
            Main_pulsewidth_bank1: [], Main_pulsewidth_bank2: [],
        };
        out.Gates_times = fileData.Gates_times || { timestamps: [], lap_data: [] }; 
        return out;
    }, [rawData]);

    // ---------- FILTERING ----------
    const filtered = useMemo(() => {
        if (!selectedTs) return allSeries;
        const start = Number(selectedTs.startTime);
        const end = Number(selectedTs.endTime);
        const newFiltered = {};
        Object.keys(allSeries).forEach(key => {
            if (key === "Gates_times") newFiltered[key] = allSeries[key];
            else if (Array.isArray(allSeries[key])) newFiltered[key] = allSeries[key].filter(pt => pt[0] >= start && pt[0] <= end);
            else newFiltered[key] = allSeries[key];
        });
        return newFiltered;
    }, [allSeries, selectedTs]);

    // ==========================================
    // 2. VIEW HELPERS (For Old Render Compatibility)
    // ==========================================
    
    // Map Data (Needs Sync of Lat/Lon/Speed)
    // We assume CAN ID 0x117 provides all 3 together, so arrays stay synced.
    const mapData = useMemo(() => {
        if (!filtered.GPS_Longitude || filtered.GPS_Longitude.length === 0) return [];
        // Map based on Longitude index, as they should be pairs
        return filtered.GPS_Longitude.map((pt, i) => [
            pt[1], // lon
            filtered.GPS_Latitude[i] ? filtered.GPS_Latitude[i][1] : 0, // lat
            filtered.GPS_Speed[i] ? filtered.GPS_Speed[i][1] : 0,       // speed
            pt[0] // time
        ]).filter(p => p[0] !== 0 && p[1] !== 0);
    }, [filtered.GPS_Longitude, filtered.GPS_Latitude, filtered.GPS_Speed]);

    const gatesArray = useMemo(() => {
        return filtered.Gates_times?.lap_data?.map((l, i) => ({ label: `Lap ${i+1}`, index: i })) || [];
    }, [filtered.Gates_times]);

    const speedVsDistance = useMemo(() => {
        // Distance calculation needs continuous data, usually handled in backend.
        // Returning placeholder to prevent crash.
        return { dist: [], speed: [] };
    }, [selectedLap, filtered]);

    // UI Helpers
    const timeStamps = (arr) => arr ? arr.map(pt => pt[0]) : [];
    const makeSeries = (arr, name, unit) => ({ name, unit, data: arr ? arr.map(pt => pt[1]) : [] });
    const toMsArr = (arr) => arr; 

    // Chart Builder Logic
    const normalizePairs = (pairs = []) => pairs.map(([t, v]) => [t, Number(v)]).filter(p => !isNaN(p[1]));

    const SIGNAL_SPECS = [
        ["Engine RPM", "RPM", "RPM"], ["GPS Speed", "GPS_Speed", "km/h"], ["Throttle", "Throttle_position", "%"],
        ["Battery", "Battery_voltage", "V"], ["Coolant Temp", "Coolant_temperature", "°C"],
        ["Manifold Pressure", "Manifold_air_pressure", "kPa"], ["Manifold Temp", "Manifold_air_temperature", "°C"],
        ["Gear", "Gear", "-"], ["Brake Pressure", "Brake_Pressure", "Bar"], ["Steering Angle", "Steering_Angle", "deg"],
        ["BSPD", "BSPD", "-"], ["Accel X", "Acceleration_on_X_axis", "m/s²"], ["Accel Y", "Acceleration_on_Y_axis", "m/s²"],
        ["Accel Z", "Acceleration_on_Z_axis", "m/s²"], ["Gyro X", "Gyroscope_on_X_axis", "rad/s"],
        ["Gyro Y", "Gyroscope_on_Y_axis", "rad/s"], ["Gyro Z", "Gyroscope_on_Z_axis", "rad/s"],
        ["Damper FL", "Damper_Left_Front", "mm"], ["Damper FR", "Damper_Right_Front", "mm"],
        ["Damper RL", "Damper_Left_Rear", "mm"], ["Damper RR", "Damper_Right_Rear", "mm"],
        ["Air Density Corr.", "Air_density_correction", "%"], ["Warmup Corr.", "Warmup_correction", "%"],
        ["TPS Accel", "TPS_based_acceleration", "%"], ["TPS Fuel Cut", "TPS_based_fuel_cut", "%"],
        ["Total Fuel Corr.", "Total_fuel_correction", "%"], ["Cold Advance", "Cold_advance", "deg"],
        ["VE Table 1", "VE_value_table_bank1", "%"], ["VE Table 2", "VE_value_table_bank2", "%"],
        ["TPS Rate", "Rate_of_change_of_TPS", "%/s"], ["RPM Rate", "Rate_of_change_of_RPM", "RPM/s"],
        ["Sync Loss Count", "Sync_loss_counter", "cnt"], ["Sync Loss Reason", "Sync_loss_reason_code", "code"],
        ["Avg Fuel Flow", "Average_fuel_flow", "cc/min"],
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
    // 3. RENDER (Old Version Layout)
    // ==========================================
    return (
        <div className="p-4 space-y-6">
            {/* Timestamp selector */}
            <div className="rounded-lg bg-white p-4 shadow space-y-2">
                <h3 className="font-medium text-gray-700">Choose Timestamp</h3>
                <TimestampSelect sessionId={session?.id} onSelect={setSelectedTs} />
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

            {/* Map */}
            <div className="flex gap-4 items-start">
                <div className="grow">
                    {geoData && (
                        <MapChart
                            geoData={geoData}
                            data={mapData}
                            gates={gatesData}
                            width={900}
                            height={400}
                        />
                    )}
                </div>

                {/* Lap times */}
                <LapTimesPanel
                    laps={filtered?.Gates_times?.lap_data || []}
                    title="Lap Times"
                />
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
                        Speed vs Distance (Lap {selectedLap + 1})
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
                    series={[{ name: "Speed", data: filtered.GPS_Speed.map(([, v]) => v), unit: "km/h" }]}
                    height={300}
                />
            </div>

            {/* Throttle & Speed & RPM vs Time */}
            <div className="rounded-lg bg-white p-4 shadow">
                <h3 className="font-medium text-gray-700 mb-2">Throttle & Speed & RPM vs Time</h3>
                <AutoPairChart
                    align="base-fastest"
                    alignMethod="linear"
                    toleranceMs={800}
                    series={[
                        {
                            name: "Throttle", unit: "%",
                            time: timeStamps(filtered.Throttle_position),
                            data: filtered.Throttle_position.map(([, v]) => v),
                        },
                        {
                            name: "Speed", unit: "km/h",
                            time: timeStamps(filtered.GPS_Speed),
                            data: filtered.GPS_Speed.map(([, v]) => v),
                        },
                        {
                            name: "RPM", unit: "RPM",
                            time: timeStamps(filtered.RPM),
                            data: filtered.RPM.map(([, v]) => v),
                        },
                        {
                            name: "Coolant temp", unit: "°C",
                            time: toMsArr(timeStamps(filtered.Coolant_temperature)), 
                            data: filtered.Coolant_temperature.map(([, v]) => v),
                        },
                    ]}
                    height={300}
                />
            </div>

           {/* 118 (Accel XYZ) - Converted to AutoPair */}
            <div className="rounded-lg bg-white p-4 shadow">
                <h3 className="font-medium text-gray-700 mb-2">118 (Acceleration)</h3>
                <AutoPairChart
                    align="base-fastest"
                    alignMethod="linear"
                    toleranceMs={100} // Low tolerance for high-freq IMU data
                    height={300}
                    series={[
                        {
                            name: "Accel X", unit: "m/s²",
                            time: timeStamps(filtered.Acceleration_on_X_axis),
                            data: filtered.Acceleration_on_X_axis?.map(pt => pt[1]) || []
                        },
                        {
                            name: "Accel Y", unit: "m/s²",
                            time: timeStamps(filtered.Acceleration_on_Y_axis),
                            data: filtered.Acceleration_on_Y_axis?.map(pt => pt[1]) || []
                        },
                        {
                            name: "Accel Z", unit: "m/s²",
                            time: timeStamps(filtered.Acceleration_on_Z_axis),
                            data: filtered.Acceleration_on_Z_axis?.map(pt => pt[1]) || []
                        }
                    ]}
                />
            </div>

            {/* 119 (Gyro XYZ) - Converted to AutoPair */}
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