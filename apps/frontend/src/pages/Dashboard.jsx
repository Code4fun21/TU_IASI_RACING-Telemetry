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
        // We initialize the filter's "memory" with the first value
        // to prevent the math from starting at zero.
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
    // yawRate: deg/s, velocity: km/h
    removeCentripetal(ayMeasured, yawRateDeg, velocityKmh) {
        const yawRateRad = yawRateDeg * (Math.PI / 180);
        const velocityMs = velocityKmh / 3.6;
        const centripetalG = (yawRateRad * velocityMs) / 9.80665;
        return ayMeasured - centripetalG;
    }

        // Rule 2: Adaptive G-Gate (Sliding StdDev)
    getAdaptiveFc(values, baseFc) {
        if (values.length < 50) return baseFc;

        // Calculate Variance of the first few seconds of the signal (or a sample)
        const sample = values.slice(0, 100); 
        const mean = sample.reduce((a, b) => a + b, 0) / sample.length;
        const variance = sample.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / sample.length;
        const stdDev = Math.sqrt(variance);

        // If the data is generally noisy (Standard Deviation > 0.15G), 
        // drop the cutoff to 3Hz to prevent the "fuzzy" lines.
        return stdDev > 0.15 ? 3.0 : baseFc;
    }

    // Rule 3: Gravity Compensation (Roll Gradient Approximation)
    // rollGradient: degrees of body roll per 1G of lateral force
    compensateRoll(ayMeasured, azMeasured, rollGradient = 3.5) {
        const phi = (ayMeasured * rollGradient) * (Math.PI / 180); // Radian roll
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

    const { fileData, session: navSession } = location.state || {};

    // 2. Define Session: Use navigation session (new file) OR context session (old file)
    const currentSession = navSession || sessionInfo;

    

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


    // Safety Check
    useEffect(() => {
        if (!rawData || rawData.length === 0) console.warn("No valid file data found.");
    }, [rawData]);

    // Fetch Track Assets
useEffect(() => {
        if (!currentSession?.trackId) return; // <--- CHANGE: session to currentSession
        let isMounted = true;
        const fetchTrackFiles = async () => {
            try {
                const track = await api.getTrackById(currentSession.trackId); // <--- CHANGE
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
// 1. Parse Raw Data ONLY if a file was uploaded (Heavy Logic)
    const parsedData = useMemo(() => {
        if (!rawData || rawData.length === 0) return null;

        // Helper to extract and scale data
        const extract = (targetKey, scaleFn = (v) => v) => {
            const keyMap = {
                "RPM": "rpm", "Throttle_position": "throttlePosition", "Battery_voltage": "batteryVoltage",
                "Coolant_temperature": "coolantTemp", "Manifold_air_pressure": "manifoldAirPressure",
                "Manifold_air_temperature": "manifoldAirTemp", "GPS_Latitude": "GPS_Latitude",
                "GPS_Longitude": "GPS_Longitude", "GPS_Speed": "GPS_Speed", "ECU_time": "timestamp",
                
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
                
                
            };
            const sourceKey = keyMap[targetKey] || targetKey;

            // --- OPTIMIZATION: DOWNSAMPLING ---
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
            Acceleration_on_X_axis_rotated: extract("Acceleration_on_X_axis_rotated"), 
            Acceleration_on_Y_axis_rotated: extract("Acceleration_on_Y_axis_rotated"),
            Acceleration_on_Z_axis_rotated: extract("Acceleration_on_Z_axis_rotated"), 
            
            Acceleration_on_X_axis_RAW: extract("Acceleration_on_X_axis_RAW"), 
            Acceleration_on_Y_axis_RAW: extract("Acceleration_on_Y_axis_RAW"),
            Acceleration_on_Z_axis_RAW: extract("Acceleration_on_Z_axis_RAW"), 
           
            
            Main_pulsewidth_bank1: [], Main_pulsewidth_bank2: [],
        };

        console.log(out)
        // --- Inside your allSeries useMemo ---
//         const tp = new TelemetryProcessor();

//         // 1. Setup Alignment & Jitter Correction
//         const accelSeries = out["Acceleration_on_X_axis_KF"] || [];
//         const gpsSeries = out["GPS_Speed"] || [];

//         let fs = 20; // Default fallback
//         if (accelSeries.length > 1) {
//             let tsDiff = accelSeries[accelSeries.length - 1][0] - accelSeries[0][0];
            
//             // Auto-detect if timestamps are milliseconds (e.g., 840,000) or seconds (e.g., 840)
//             let durationSeconds = tsDiff > 10000 ? tsDiff / 1000 : tsDiff;
            
//             fs = accelSeries.length / durationSeconds;
            
//             // Ultimate safety net: If math goes crazy, force it back to 20Hz
//             if (fs < 5 || fs > 500) fs = 20; 
// }

//         const correctedAx = [];
//         const correctedAy = [];

//         // 2. Linear Interpolation Helper for GPS Speed
//         const getInterpolatedSpeed = (targetTs) => {
//             if (gpsSeries.length === 0) return 0;
//             const nextIdx = gpsSeries.findIndex(p => p[0] >= targetTs);
//             if (nextIdx <= 0) return gpsSeries[0]?.[1] || 0;
            
//             const p1 = gpsSeries[nextIdx - 1];
//             const p2 = gpsSeries[nextIdx];
//             const tRatio = (targetTs - p1[0]) / (p2[0] - p1[0]);
//             return p1[1] + tRatio * (p2[1] - p1[1]);
//         };

//         // 3. The Combined Processing Loop
//         for (let i = 0; i < accelSeries.length; i++) {
//             const [ts, axRaw] = accelSeries[i];
//             const ayRaw = out["Acceleration_on_Y_axis_KF"]?.[i]?.[1] || 0;
//             const azRaw = out["Acceleration_on_Z_axis_KF"]?.[i]?.[1] || 1; // Default 1G
//             // Change "gyroZ" to the correct key
//             const gzRaw = out["Gyroscope_on_Z_axis_KF"]?.[i]?.[1] || 0;
            
//             // Rule 4: Get speed aligned exactly to MPU timestamp
//             const speed = getInterpolatedSpeed(ts);

//             // Rule 1: Centripetal Correction
//             let ayClean = tp.removeCentripetal(ayRaw, gzRaw, speed);

//             // Rule 3: Roll Compensation
//             const ayCorrected = tp.compensateRoll(ayClean, azRaw, 3.0); // Assume 3 deg/G roll gradient

//             correctedAx.push(axRaw);
//             correctedAy.push(ayCorrected);
//         }

//         // 4. Rule 2: Adaptive Final Pass
//         const fcX = tp.getAdaptiveFc(correctedAx, 5);
//         const finalAx = tp.bw.filtFilt(correctedAx, fs, fcX);
//         const finalAy = tp.bw.filtFilt(correctedAy, fs, 5);

//         // 5. Map back
//         out["Acceleration_on_X_axis_KF"] = accelSeries.map((p, i) => [p[0], finalAx[i]]);
//         out["Acceleration_on_Y_axis_KF"] = accelSeries.map((p, i) => [p[0], finalAy[i]]);
        out.Gates_times = fileData.Gates_times || { timestamps: [], lap_data: [] }; 

//         console.log(fileData)
        return out;
    }, [rawData, fileData]);

    // 2. Select Source: Use New Parsed Data if available, otherwise use Context Data
    const allSeries = useMemo(() => {
        if (parsedData) return parsedData;
        if (telemetryData && Object.keys(telemetryData).length > 0) return telemetryData;
        return {};
    }, [parsedData, telemetryData]);

    // 3. Save to Context (Run ONLY once when new data is parsed)
    useEffect(() => {
        if (parsedData && currentSession && currentSession.id) {
            setTelemetryData(parsedData); 
            setSessionInfo(currentSession);    
        }
    }, [parsedData, currentSession, setTelemetryData, setSessionInfo]);


const gatesArray = useMemo(() => {
        const laps = allSeries.Gates_times?.lap_data;
        const timeRef = allSeries.ECU_time || allSeries.GPS_Speed;

        // Safety checks
        if (!laps || !timeRef || timeRef.length === 0) return [];

        const segments = [];
        
        // 2. Get absolute session start/end
        const sessionStart = timeRef[0][0]; 
        const sessionEnd = timeRef[timeRef.length - 1][0];

        // 3. Add "Pre-Session / Out Lap" (Data before Lap 1)
        const firstLapStart = laps[0]?.S0;
        if (firstLapStart && firstLapStart > sessionStart) {
            segments.push({
                label: "Pre-Session / Out Lap",
                startTime: sessionStart,
                endTime: firstLapStart
            });
        }

        // 4. Add Actual Laps
        laps.forEach((lap, index) => {
            segments.push({
                label: `Lap ${index + 1}`,
                startTime: lap.S0,
                endTime: lap.S3 || lap.ts
            });
        });

        // 5. Add "Post-Session / In Lap" (Data after last lap)
        const lastLap = laps[laps.length - 1];
        const lastLapEnd = lastLap?.S3 || lastLap?.ts;

        if (lastLapEnd && sessionEnd > lastLapEnd) {
            segments.push({
                label: "Post-Session / In Lap",
                startTime: lastLapEnd,
                endTime: sessionEnd
            });
        }

        // 6. Map to standard format with index
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
// 2. Filter Data based on Lap OR Stint
// 2. Filter Data based on Lap, Turn, or Stint
const filtered = useMemo(() => {
    let timeWindows = [];
    let isFiltering = false;

    const lapsData = allSeries.Gates_times?.lap_data || [];

    // CASE 1: A Turn is selected (Works for All Laps OR a Specific Lap)
    if (selectedTurn) {
        isFiltering = true;
        
        // If a lap is selected, only check that lap. Otherwise, check ALL laps.
        const lapsToCheck = selectedLap !== null 
            ? [lapsData[selectedLap]].filter(Boolean) 
            : lapsData;

        lapsToCheck.forEach(lap => {
            if (!lap) return;
            const timeIn = lap[`${selectedTurn} IN`];
            const timeOut = lap[`${selectedTurn} OUT`];
            
            if (timeIn && timeOut) {
                timeWindows.push({ min: Math.min(timeIn, timeOut), max: Math.max(timeIn, timeOut) });
            } else if (timeIn) {
                timeWindows.push({ min: timeIn, max: timeIn + 3 });
            } else if (timeOut) {
                timeWindows.push({ min: timeOut - 3, max: timeOut });
            }
        });
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

    // If no filters are active, return everything immediately
    if (!isFiltering) return allSeries;

    const newFiltered = {};
    
    Object.keys(allSeries).forEach(key => {
        if (key === "Gates_times") {
            newFiltered[key] = allSeries[key];
            return;
        }

        const seriesData = allSeries[key];

        if (Array.isArray(seriesData)) {
             // If a filter is active but we found 0 valid time windows (e.g., turn wasn't crossed)
             if (timeWindows.length === 0) {
                 newFiltered[key] = [];
             } else {
                 newFiltered[key] = seriesData.filter(pt => {
                     const t = pt[0]; 
                     // Keep the point if it falls inside ANY of our active time windows
                     return timeWindows.some(w => t >= w.min && t <= w.max);
                 });
             }
        } else {
             newFiltered[key] = seriesData;
        }
    });

    return newFiltered;
}, [allSeries, selectedLap, selectedTs, gatesArray, selectedTurn]);

useEffect(() => {

        if (rawData && rawData.length > 0 && allSeries && Object.keys(allSeries).length > 0) {
            setTelemetryData(allSeries); 
            setSessionInfo(currentSession);    
        }
    }, [allSeries, currentSession, rawData, setTelemetryData, setSessionInfo]);

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

// 1. Build the list of laps from the full dataset
    

const speedVsDistance = useMemo(() => {
    const distData = filtered.Distance;    // [[time, meters], ...] (Dense)
    const speedData = filtered.GPS_Speed;  // [[time, km/h], ...]  (Sparse)

    if (!distData || !speedData || distData.length === 0 || speedData.length === 0) {
      return { dist: [], speed: [] };
    }

    const distOut = [];
    const speedOut = [];

    // We iterate through the SPEED data (since it's the limiting factor)
    // and find the matching DISTANCE for that time.
    
    let distIdx = 0;
    
    for (let i = 0; i < speedData.length; i++) {
        const [tSpeed, valSpeed] = speedData[i];

        // Move the distance index forward until we catch up to the speed timestamp
        // (Stop if we go past it)
        while (distIdx < distData.length - 1 && distData[distIdx][0] < tSpeed) {
            distIdx++;
        }

        // Check if the timestamps are close enough (e.g. within 100ms)
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
    const makeSeries = (arr, name, unit) => ({ name, unit, data: arr ? arr.map(pt => pt[1]) : [] });
    const toMsArr = (arr) => arr; 

    // Chart Builder Logic
    const normalizePairs = (pairs = []) => pairs.map(([t, v]) => [t, Number(v)]).filter(p => !isNaN(p[1]));

    const SIGNAL_SPECS = [
        ["Engine RPM", "RPM", "RPM"], ["GPS Speed", "GPS_Speed", "km/h"], ["Throttle", "Throttle_position", "%"],
        ["Battery", "Battery_voltage", "V"], ["Coolant Temp", "Coolant_temperature", "°C"],
        ["Manifold Pressure", "Manifold_air_pressure", "kPa"], ["Manifold Temp", "Manifold_air_temperature", "°C"],
        ["Gear", "Gear", "-"], ["Brake Pressure", "Brake_Pressure", "Bar"], ["Steering Angle", "Steering_Angle", "deg"],
        ["BSPD", "BSPD", "-"],
       
        ["Damper FL", "Damper_Left_Front", "mm"], ["Damper FR", "Damper_Right_Front", "mm"],
        ["Damper RL", "Damper_Left_Rear", "mm"], ["Damper RR", "Damper_Right_Rear", "mm"],
        ["Air Density Corr.", "Air_density_correction", "%"], ["Warmup Corr.", "Warmup_correction", "%"],
        ["TPS Accel", "TPS_based_acceleration", "%"], ["TPS Fuel Cut", "TPS_based_fuel_cut", "%"],
        ["Total Fuel Corr.", "Total_fuel_correction", "%"], ["Cold Advance", "Cold_advance", "deg"],
        ["VE Table 1", "VE_value_table_bank1", "%"], ["VE Table 2", "VE_value_table_bank2", "%"],
        ["TPS Rate", "Rate_of_change_of_TPS", "%/s"], ["RPM Rate", "Rate_of_change_of_RPM", "RPM/s"],
        ["Sync Loss Count", "Sync_loss_counter", "cnt"], ["Sync Loss Reason", "Sync_loss_reason_code", "code"],
        ["Avg Fuel Flow", "Average_fuel_flow", "cc/min"],

        
        ["Accel X (rotated)", "Acceleration_on_X_axis_rotated", "G"], 
        ["Accel Y (rotated)", "Acceleration_on_Y_axis_rotated", "G"],
        ["Accel Z (rotated)", "Acceleration_on_Z_axis_rotated", "G"],

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
    // 3. RENDER (Old Version Layout)
    // ==========================================
    return (
        <div className="p-4 space-y-6">
            {/* Timestamp selector */}
            <div className="rounded-lg bg-white p-4 shadow space-y-2">
                <h3 className="font-medium text-gray-700">Choose Timestamp</h3>
                <TimestampSelect 
                    sessionId={currentSession?.id} 
                    onSelect={(ts) => {
                        setSelectedTs(ts);
                        setSelectedLap(null); // <--- Auto-reset lap selection when changing stint
                    }} 
                />
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


            {/* Map */}
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
                                width="100%"   // Responsive width
                                height="100%"  // Responsive height
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
                        laps={filtered?.Gates_times?.lap_data || []}
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
                    toleranceMs={1000}
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
                            name: "Accel X", unit: "G",
                            time: timeStamps(filtered.Acceleration_on_X_axis_rotated),
                            data: filtered.Acceleration_on_X_axis_rotated?.map(pt => pt[1]) || []
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