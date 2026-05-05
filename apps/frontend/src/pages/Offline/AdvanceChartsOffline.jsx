import { useEffect, useMemo, useState } from "react";
import * as echarts from "echarts";
import { useTelemetry } from "../../store/OfflineDataStoreadge"; 
import { ButterworthProcessor } from "../Dashboard";

import TimestampSelect from "../MQTT/Components/TimestampSelect";
import VitalChart from "../MQTT/MoreCharts/Charts/VitalChart";
import GGChart from "../MQTT/MoreCharts/Charts/GGChart";
import AutoPairChart from "../MQTT/MoreCharts/Charts/AutoPairChart";

// --- HELPER 1: FIND BIAS & ANGLE (Updated to include Y-Axis) ---
const getStandardDeviation = (array, mean) => {
    const n = array.length;
    if (n === 0) return 0;
    return Math.sqrt(array.map(x => Math.pow(x - mean, 2)).reduce((a, b) => a + b) / n);
};

// --- HELPER 1: ADVANCED CALIBRATION ROUTINE ---
const calculateSessionCalibration = (telemetryData) => {
    if (!telemetryData || !telemetryData.GPS_Speed || !telemetryData.RPM || 
        !telemetryData.Acceleration_on_X_axis_RAW || !telemetryData.Acceleration_on_Z_axis_RAW || !telemetryData.Acceleration_on_Y_axis_RAW) {
        return { x_bias: 0, y_bias: 1.0, z_bias: 0, scale: 1.0, status: "No Data" };
    }

    const speed = telemetryData.GPS_Speed;
    const rpm = telemetryData.RPM;
    const accX = telemetryData.Acceleration_on_X_axis_RAW; // Long
    const accY = telemetryData.Acceleration_on_Y_axis_RAW; // Vert (1G)
    const accZ = telemetryData.Acceleration_on_Z_axis_RAW; // Lat

    const len = Math.min(speed.length, rpm.length, accX.length, accY.length, accZ.length);
    
    // --- STEP 1: FIND STABLE WINDOW ---
    let bestStartIndex = -1;
    let maxWindowSize = 0;
    let currentStartIndex = -1;
    let currentCount = 0;

    for (let i = 0; i < len; i++) {
        if (speed[i][1] < 0.5 && rpm[i][1] > 500) { // Speed < 0.5 km/h
            if (currentStartIndex === -1) currentStartIndex = i;
            currentCount++;
        } else {
            if (currentCount > maxWindowSize) {
                maxWindowSize = currentCount;
                bestStartIndex = currentStartIndex;
            }
            currentStartIndex = -1;
            currentCount = 0;
        }
    }

    if (maxWindowSize < 50) return { x_bias: 0, y_bias: 1.0, z_bias: 0, scale: 1.0, status: "Failed (No Window)" };

    // --- STEP 2: CALCULATE BIAS (STATIC GRAVITY LEAK) ---
    let sumX = 0, sumY = 0, sumZ = 0;
    for (let i = bestStartIndex; i < bestStartIndex + maxWindowSize; i++) {
        sumX += accX[i][1];
        sumY += accY[i][1];
        sumZ += accZ[i][1];
    }

    const meanX = sumX / maxWindowSize;
    const meanY = sumY / maxWindowSize; // This is the Vertical 1G vector
    const meanZ = sumZ / maxWindowSize;

    // --- STEP 3: MAGNITUDE SCALING ---
    // If the sensor is healthy, the vector sum of X, Y, Z should be exactly 1.0G
    const totalMag = Math.sqrt(meanX**2 + meanY**2 + meanZ**2);
    const scaleFactor = Math.abs(totalMag - 1.0) > 0.01 ? (1.0 / totalMag) : 1.0;

    return {
        x_bias: meanX, // Gravity leaking into Long axis
        y_bias: meanY, // Gravity on Vertical axis (expected ~1.0)
        z_bias: meanZ, // Gravity leaking into Lat axis
        scale: scaleFactor,
        status: "Success"
    };
};

// --- HELPER 2: PROCESS SERIES FOR VITAL CHART ---
const processSeries = (dataPairArray) => {
    if (!dataPairArray || dataPairArray.length === 0) return { times: [], values: [] };
    const times = dataPairArray.map(pt => pt[0]);
    const values = dataPairArray.map(pt => pt[1]);
    return { times, values };
};

const timeStamps = (arr) => arr ? arr.map(pt => pt[0]) : [];

export default function AdvanceChartsOffline() {
    const GROUP_ID = "syncGroup";
    const { telemetryData, sessionInfo } = useTelemetry();     
    
    const [selectedTs, setSelectedTs] = useState(null);
    const [selectedLap, setSelectedLap] = useState(null);
    const [selectedTurn, setSelectedTurn] = useState(null); // <-- NEW: Turn State

    // Safety check
    if (!telemetryData) {
        return (
            <div className="p-10 text-center text-gray-500">
                <p>No telemetry data loaded.</p>
                <p className="text-sm mt-2">Go back to Dashboard and load a file first.</p>
            </div>
        );
    }

    const bw = useMemo(() => new ButterworthProcessor(), []);

    // --- 1. Construct Segments ---
    const gatesArray = useMemo(() => {
        const laps = telemetryData.Gates_times?.lap_data;
        const timeRef = telemetryData.ECU_time || telemetryData.GPS_Speed;

        if (!laps || !timeRef || timeRef.length === 0) return [];

        const segments = [];
        const sessionStart = timeRef[0][0]; 
        const sessionEnd = timeRef[timeRef.length - 1][0];

        // A. Out Lap
        const firstLapStart = laps[0]?.S0;
        if (firstLapStart && firstLapStart > sessionStart) {
            segments.push({
                label: "Pre-Session / Out Lap",
                startTime: sessionStart,
                endTime: firstLapStart
            });
        }

        // B. Actual Laps
        laps.forEach((lap, index) => {
            segments.push({
                label: `Lap ${index + 1}`,
                startTime: lap.S0,
                endTime: lap.S3 || lap.ts
            });
        });

        // C. In Lap
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
    }, [telemetryData]);

    // --- 1.5 Extract Available Turns ---
    const availableTurns = useMemo(() => {
        const laps = telemetryData.Gates_times?.lap_data;
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
    }, [telemetryData]);

    // --- 2. Filter Data based on Selection (Updated to include Turns) ---
    const filtered = useMemo(() => {
        let timeWindows = [];
        let isFiltering = false;

        const lapsData = telemetryData.Gates_times?.lap_data || [];

        // CASE 1: A Turn is selected (Works for All Laps OR a Specific Lap)
        if (selectedTurn) {
            isFiltering = true;
            
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
        if (!isFiltering) return telemetryData;

        const newFiltered = {};
        
        Object.keys(telemetryData).forEach(key => {
            if (key === "Gates_times") {
                newFiltered[key] = telemetryData[key];
                return;
            }

            const seriesData = telemetryData[key];

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
    }, [telemetryData, selectedLap, selectedTs, gatesArray, selectedTurn]);

    // --- 3. AUTOMATIC CALIBRATION (Runs once per file) ---
    const calibration = useMemo(() => {
        return calculateSessionCalibration(telemetryData);
    }, [telemetryData]); 


    // --- HELPER 3: UNIFORM RESAMPLING (LINEAR INTERPOLATION) ---
    const resampleSeries = (series, targetFs, startTime, endTime) => {
        if (!series || series.length === 0) return [];
        
        const intervalMs = 1000 / targetFs;
        const resampledValues = [];
        const resampledTimes = [];
        let currentIndex = 0;

        for (let t = startTime; t <= endTime; t += intervalMs) {
            while (currentIndex < series.length - 1 && series[currentIndex + 1][0] < t) {
                currentIndex++;
            }

            const p0 = series[currentIndex];
            const p1 = series[currentIndex + 1];

            resampledTimes.push(t);

            if (!p1 || p0[0] === t) {
                resampledValues.push(p0[1]); 
            } else {
                const ratio = (t - p0[0]) / (p1[0] - p0[0]);
                const val = p0[1] + ratio * (p1[1] - p0[1]);
                resampledValues.push(val);
            }
        }
        return { times: resampledTimes, values: resampledValues };
    };

    // --- 4. GENERATE ALL CALIBRATED DATA ---
    const centeredMovingAverage = (data, windowSize) => {
        const halfWindow = Math.floor(windowSize / 2);
        const len = data.length;
        const result = new Array(len);
        const cumSum = new Float64Array(len + 1);
        
        cumSum[0] = 0;
        for (let i = 0; i < len; i++) {
            cumSum[i + 1] = cumSum[i] + data[i];
        }

        for (let i = 0; i < len; i++) {
            const start = Math.max(0, i - halfWindow);
            const end = Math.min(len - 1, i + halfWindow);
            const count = end - start + 1;
            const sum = cumSum[end + 1] - cumSum[start];
            result[i] = sum / count;
        }
        return result;
    };

    const calibratedData = useMemo(() => {
        const accX = filtered.Acceleration_on_X_axis_RAW; 
        const accY = filtered.Acceleration_on_Y_axis_RAW; 
        const accZ = filtered.Acceleration_on_Z_axis_RAW; 
        const gpsSeries = filtered.GPS_Speed || [];

        if (!accX || !accY || !accZ || calibration.status !== "Success") return null;

        const len = Math.min(accX.length, accY.length, accZ.length);
        
        const pitch = Math.asin(Math.max(-1, Math.min(1, calibration.x_bias))); 
        const roll  = Math.asin(Math.max(-1, Math.min(1, calibration.y_bias)));
        const cosP = Math.cos(pitch); const sinP = Math.sin(pitch);
        const cosR = Math.cos(roll);  const sinR = Math.sin(roll);

        const rawLongPairs = [];
        const rawLatPairs = [];
        const rawVertPairs = [];
        const times = [];

        const getInterpolatedSpeed = (targetTs) => {
            if (gpsSeries.length === 0) return 0;
            const nextIdx = gpsSeries.findIndex(p => p[0] >= targetTs);
            if (nextIdx <= 0) return gpsSeries[0]?.[1] || 0;
            const p1 = gpsSeries[nextIdx - 1];
            const p2 = gpsSeries[nextIdx];
            
            if (p2[0] === p1[0]) return p1[1]; 
            
            const tRatio = (targetTs - p1[0]) / (p2[0] - p1[0]);
            return p1[1] + tRatio * (p2[1] - p1[1]);
        };

        for (let i = 0; i < len; i++) {
            const time = accX[i][0];
            let x = accX[i][1]; let y = accY[i][1]; let z = accZ[i][1]; 

            let x_leveled = x * cosP - z * sinP;
            let z_temp    = x * sinP + z * cosP;
            let y_leveled = y * cosR - z_temp * sinR;
            let z_final   = y * sinR + z_temp * cosR;

            times.push(time);
            
            rawLongPairs.push([time, x_leveled * -1]);
            rawLatPairs.push([time, y_leveled * -1]);
            rawVertPairs.push([time, z_final]); 
        }

        let fs = 10; 
        if (times.length > 1) {
            let tsDiff = times[times.length - 1] - times[0];
            let durationSeconds = tsDiff > 10000 ? tsDiff / 1000 : tsDiff;
            fs = times.length / durationSeconds;
            if (fs < 5 || fs > 500) fs = 10; 
        }

        const targetFs = Math.round(fs);

        const rawLongValues = rawLongPairs.map(p => p[1]);
        const rawLatValues = rawLatPairs.map(p => p[1]);
        const rawVertValues = rawVertPairs.map(p => p[1]);

        const windowSize = targetFs * 60;

        const dynamicBiasLong = centeredMovingAverage(rawLongValues, windowSize);
        const dynamicBiasLat = centeredMovingAverage(rawLatValues, windowSize);

        const centeredLong = rawLongValues.map((val, i) => val - dynamicBiasLong[i]);
        const centeredLat = rawLatValues.map((val, i) => val - dynamicBiasLat[i]);

        const finalLong = bw.filtFilt([...centeredLong], targetFs, 1.7);
        const finalLat = bw.filtFilt([...centeredLat], targetFs, 1.7);

        const seriesLong = [];
        const seriesLat = [];
        const seriesVert = [];
        const ggPoints = [];

        for (let i = 0; i < times.length; i++) {
            const t = times[i];

            seriesLong.push([t, finalLong[i]]);
            seriesLat.push([t, finalLat[i]]);
            seriesVert.push([t, rawVertValues[i]]);
            
            const speedAtT = getInterpolatedSpeed(t);
            if (speedAtT >= 30) {
                ggPoints.push([finalLat[i], finalLong[i]]);
            }
        }

        return {
            seriesLong,
            seriesLat,
            seriesVert,
            ggPoints
        };
    }, [filtered.Acceleration_on_X_axis_RAW, filtered.Acceleration_on_Y_axis_RAW, filtered.Acceleration_on_Z_axis_RAW, filtered.GPS_Speed, calibration, bw]);

    // --- GENERATE RAW G-G DATA (No Calibration) ---
    const rawGGData = useMemo(() => {
        const accX = filtered.Acceleration_on_X_axis_RAW; 
        const accZ = filtered.Acceleration_on_Z_axis_RAW; 

        if (!accX || !accZ) return [];

        const len = Math.min(accX.length, accZ.length);
        const points = [];

        for (let i = 0; i < len; i++) {
            points.push([accZ[i][1], accX[i][1]]);
        }
        return points;
    }, [filtered]);

    // Vital Chart Data
    const vitalChartsData = useMemo(() => {
        if (!filtered.RPM || !filtered.GPS_Speed) return null;
        const rpm = processSeries(filtered.RPM);
        const speed = processSeries(filtered.GPS_Speed);
        
        return {
            times: rpm.times, 
            series: [
                { name: "Engine RPM", data: rpm.values, unit: "rpm" },
                { name: "Speed", data: speed.values, unit: "km/h" }
            ]
        };
    }, [filtered]);

    useEffect(() => {
        echarts.connect(GROUP_ID);
    }, []);

    return (
        <div className="p-4 space-y-6">
            {/* Timestamp selector */}
            <div className="rounded-lg bg-white p-4 shadow space-y-2">
                <h3 className="font-medium text-gray-700">Choose Timestamp</h3>
                <TimestampSelect 
                    sessionId={sessionInfo?.id} 
                    onSelect={(ts) => {
                        setSelectedTs(ts);
                        setSelectedLap(null); 
                    }} 
                />
            </div>

            {/* Lap selector */}
            <div className="rounded-lg bg-white p-4 shadow">
                <h3 className="font-medium text-gray-700 mb-2">Choose Segment</h3>
                <select
                    className="w-full border-gray-300 rounded-md"
                    value={selectedLap ?? ""}
                    onChange={(e) => setSelectedLap(e.target.value === "" ? null : Number(e.target.value))}
                >
                    <option value="">Full Session (All Laps)</option>
                    {gatesArray.map((g) => (
                        <option key={g.index} value={g.index}>
                            {g.label} ({Math.round(g.endTime - g.startTime)}s)
                        </option>
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
            
            {/* Vital Functions Chart */}
            {vitalChartsData && (
                <div className="rounded-lg bg-white p-4 shadow">
                     <VitalChart 
                        dateTime={vitalChartsData.times} 
                        series={vitalChartsData.series} 
                        group={GROUP_ID} 
                        height={300}
                    />
                </div>
            )}

            {/* G-G Diagram (Uses Calibrated Data) */}
            <div className="rounded-lg bg-white p-4 shadow">
                <h3 className="font-medium text-gray-700 mb-2">G-G Diagram (Auto-Leveled)</h3>
                <GGChart data={calibratedData ? calibratedData.ggPoints : []} height={1000} />
            </div>
           
            {/* Acceleration Traces (Uses Calibrated Data) */}
            <div className="rounded-lg bg-white p-4 shadow">
                <h3 className="font-medium text-gray-700 mb-2">118 (Acceleration - Calibrated)</h3>
                {calibratedData && (
                    <AutoPairChart
                        align="base-fastest"
                        alignMethod="linear"
                        toleranceMs={100}
                        height={300}
                        series={[
                            {
                                name: "Accel Long (X)", unit: "G",
                                time: timeStamps(calibratedData.seriesLong),
                                data: calibratedData.seriesLong.map(pt => pt[1])
                            },
                            {
                                name: "Accel Lat (Y)", unit: "G",
                                time: timeStamps(calibratedData.seriesLat),
                                data: calibratedData.seriesLat.map(pt => pt[1])
                            },
                            {
                                name: "Accel Vert (Z)", unit: "G",
                                time: timeStamps(calibratedData.seriesVert),
                                data: calibratedData.seriesVert.map(pt => pt[1])
                            }
                        ]}
                    />
                )}
            </div>
            
        </div>       
    );
}