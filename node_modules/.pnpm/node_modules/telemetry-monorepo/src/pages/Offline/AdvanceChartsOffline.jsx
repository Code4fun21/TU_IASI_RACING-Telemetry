import { useEffect, useMemo, useState } from "react";
import * as echarts from "echarts";
import { useTelemetry } from "../../store/OfflineDataStoreadge"; 

import TimestampSelect from "../MQTT/Components/TimestampSelect";
import VitalChart from "../MQTT/MoreCharts/Charts/VitalChart";
import GGChart from "../MQTT/MoreCharts/Charts/GGChart";
import AutoPairChart from "../MQTT/MoreCharts/Charts/AutoPairChart";

// --- HELPER 1: FIND BIAS & ANGLE (The "Search Backward" Logic) ---
const calculateSessionCalibration = (telemetryData) => {
    if (!telemetryData || !telemetryData.GPS_Speed || !telemetryData.RPM || 
        !telemetryData.Acceleration_on_X_axis || !telemetryData.Acceleration_on_Z_axis) {
        return { lat: 0, long: 0, angle: 0 };
    }

    const speed = telemetryData.GPS_Speed;
    const rpm = telemetryData.RPM;
    const accLong = telemetryData.Acceleration_on_X_axis; 
    const accLat = telemetryData.Acceleration_on_Z_axis; 
    const len = Math.min(speed.length, rpm.length, accLong.length, accLat.length);
    
    // 1. Find Launch Index
    let launchIndex = -1;
    for (let i = 0; i < len; i++) {
        if (speed[i][1] > 10.0) {
            launchIndex = i;
            break;
        }
    }

    if (launchIndex === -1) launchIndex = Math.min(len, 500); 

    // 2. Search Backward for stationary idling window
    let sumLat = 0;
    let sumLong = 0;
    let count = 0;
    const samplesNeeded = 50; 

    for (let i = launchIndex; i >= 0; i--) {
        const s = speed[i][1];
        const r = rpm[i][1];

        if (s < 1.0 && r > 500) {
            sumLat += accLat[i][1];
            sumLong += accLong[i][1];
            count++;
            if (count >= samplesNeeded) break;
        }
    }

    if (count > 0) {
        const biasLat = sumLat / count;
        const biasLong = sumLong / count;

        // 3. AUTO-CALCULATE ANGLE
        // We calculate the angle of the "static vector" relative to the horizon
        // This detects if the sensor is mounted slightly crooked
        const calculatedAngleRad = Math.atan2(biasLat, biasLong);
        const calculatedAngleDeg = calculatedAngleRad * (180 / Math.PI);

        console.log(`%c[Calibration Success]`, "color: green; font-weight: bold;");
        console.log(`> Samples: ${count}`);
        console.log(`> Static Bias: Lat=${biasLat.toFixed(4)}, Long=${biasLong.toFixed(4)}`);
        console.log(`> Auto-detected Sensor Angle: ${calculatedAngleDeg.toFixed(2)}°`);

        return { lat: biasLat, long: biasLong, angle: calculatedAngleDeg };
    }
    
    return { lat: 0, long: 0, angle: 0 };
};

// --- HELPER 2: APPLY CALIBRATION ---
const applyCalibration = (accelLong, accelLat, calibration) => {
    if (!accelLong || !accelLat) return [];
    
    const points = [];
    const len = Math.min(accelLong.length, accelLat.length);

    // Use the auto-calculated angle from the calibration step
    const angleRad = (calibration.angle || 0) * (Math.PI / 180);
    const cosA = Math.cos(angleRad);
    const sinA = Math.sin(angleRad);

    for (let i = 0; i < len; i++) {
        // 1. Zero the data
        const x_zero = accelLat[i][1] - calibration.lat;   
        const y_zero = accelLong[i][1] - calibration.long; 

        // 2. Automatic Rotation Correction
        const rotatedLat = (x_zero * cosA) - (y_zero * sinA);
        const rotatedLong = (x_zero * sinA) + (y_zero * cosA);

        points.push([rotatedLat, rotatedLong]);
    }
    return points;
};

const processSeries = (dataPairArray) => {
    if (!dataPairArray || dataPairArray.length === 0) return { times: [], values: [] };
    return { times: dataPairArray.map(pt => pt[0]), values: dataPairArray.map(pt => pt[1]) };
};

const timeStamps = (arr) => arr ? arr.map(pt => pt[0]) : [];

export default function AdvanceChartsOffline() {
    const GROUP_ID = "syncGroup";
    const { telemetryData, sessionInfo } = useTelemetry();     
    const [selectedTs, setSelectedTs] = useState(null);
    const [selectedLap, setSelectedLap] = useState(null);

    if (!telemetryData) return <div className="p-10 text-center">No data loaded.</div>;

    const gatesArray = useMemo(() => {
        const laps = telemetryData.Gates_times?.lap_data;
        const timeRef = telemetryData.ECU_time || telemetryData.GPS_Speed;
        if (!laps || !timeRef) return [];
        const sessionStart = timeRef[0][0]; 
        const sessionEnd = timeRef[timeRef.length - 1][0];

        const segments = [];
        if (laps[0]?.S0 > sessionStart) segments.push({ label: "Out Lap", startTime: sessionStart, endTime: laps[0].S0 });
        laps.forEach((lap, i) => segments.push({ label: `Lap ${i + 1}`, startTime: lap.S0, endTime: lap.S3 || lap.ts }));
        const lastEnd = laps[laps.length - 1]?.S3 || laps[laps.length - 1]?.ts;
        if (lastEnd < sessionEnd) segments.push({ label: "In Lap", startTime: lastEnd, endTime: sessionEnd });

        return segments.map((seg, i) => ({ ...seg, index: i }));
    }, [telemetryData]);

    const filtered = useMemo(() => {
        let min = -Infinity, max = Infinity, isF = false;
        if (selectedLap !== null && gatesArray[selectedLap]) {
            min = gatesArray[selectedLap].startTime; max = gatesArray[selectedLap].endTime; isF = true;
        } else if (selectedTs) {
            min = Number(selectedTs.startTime); max = Number(selectedTs.endTime); isF = true;
        }
        if (!isF) return telemetryData;

        const res = {};
        Object.keys(telemetryData).forEach(k => {
            if (k === "Gates_times") { res[k] = telemetryData[k]; return; }
            res[k] = Array.isArray(telemetryData[k]) ? telemetryData[k].filter(p => p[0] >= min && p[0] <= max) : telemetryData[k];
        });
        return res;
    }, [telemetryData, selectedLap, selectedTs, gatesArray]);

    // --- AUTOMATIC CALIBRATION (Runs once per file) ---
    const calibration = useMemo(() => {
        return calculateSessionCalibration(telemetryData);
    }, [telemetryData]); 

    // --- APPLY CALIBRATION TO CHART ---
    const ggData = useMemo(() => {
        if (!filtered.Acceleration_on_X_axis || !filtered.Acceleration_on_Z_axis) return [];
        return applyCalibration(filtered.Acceleration_on_X_axis, filtered.Acceleration_on_Z_axis, calibration);
    }, [filtered, calibration]);



    const vitalData = useMemo(() => {
        if (!filtered.RPM || !filtered.GPS_Speed) return null;
        return { times: filtered.RPM.map(p => p[0]), series: [{ name: "RPM", data: filtered.RPM.map(p => p[1]), unit: "rpm" }, { name: "Speed", data: filtered.GPS_Speed.map(p => p[1]), unit: "km/h" }] };
    }, [filtered]);

    useEffect(() => { echarts.connect(GROUP_ID); }, []);

    return (
            <div className="p-4 space-y-6">
                <div className="rounded-lg bg-white p-4 shadow">
                    <TimestampSelect sessionId={sessionInfo?.id} onSelect={(ts) => { setSelectedTs(ts); setSelectedLap(null); }} />
            </div>

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

            
            {vitalData && <div className="bg-white p-4 shadow rounded-lg"><VitalChart dateTime={vitalData.times} series={vitalData.series} group={GROUP_ID} height={300}/></div>}

            <div className="bg-white p-4 shadow rounded-lg">
                <h3 className="font-medium text-gray-700 mb-2">G-G Diagram (Auto-Leveled)</h3>
                <GGChart data={ggData} height={400} />
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
                            time: timeStamps(filtered.Acceleration_on_X_axis),
                            data: filtered.Acceleration_on_X_axis?.map(pt => pt[1]) || []
                        },
                        {
                            name: "Accel Y", unit: "G",
                            time: timeStamps(filtered.Acceleration_on_Y_axis),
                            data: filtered.Acceleration_on_Y_axis?.map(pt => pt[1]) || []
                        },
                        {
                            name: "Accel Z", unit: "G",
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
// <div>
//                 {/* <OfflineActionBar /> */}
//                 <dl className="mt-5 flex flex-row  gap-5 ">
//                     <div className="overflow-hidden rounded-lg bg-white px-4 py-5 shadow sm:p-6">
//                         <dt className="truncate text-sm font-medium text-gray-500 text-center">Vital Functions</dt>

//                         <MapChart data={sampleData} width={800} height={400} />
//                     </div>
//                 </dl>
//                 <div className="mx-auto max-w-full py-6 ">
//                     <div className="grid grid-cols-1  items-start gap-4 lg:grid-cols-2 xl:grid-cols-4 ">
//                         <div className="order-6 col-span-4 grid grid-cols-1 lg:col-span-2">
//                             <section aria-labelledby="section-2-title">
//                                 <h2 id="section-2-title" className="sr-only">
//                                     Vital Functions
//                                 </h2>
//                                 <div className="overflow-visible rounded-lg bg-white shadow">
//                                     <dt className="truncate text-sm font-medium text-gray-500 text-center">
//                                         Vital Functions
//                                     </dt>
//                                     <VitalChart />
//                                 </div>
//                             </section>
//                         </div>
//                         <div className="order-7 col-span-4 grid grid-cols-1 lg:col-span-2">
//                             <section aria-labelledby="section-2-title">
//                                 <h2 id="section-2-title" className="sr-only">
//                                     Section title
//                                 </h2>
//                                 <div className="overflow-visible rounded-lg bg-white shadow">
//                                     <dt className="truncate text-sm font-medium text-gray-500 text-center">Gearing</dt>
//                                     <VitalChart />
//                                 </div>
//                             </section>
//                         </div>
//                     </div>
//                 </div>
//                 <div className="mx-auto max-w-full py-6 ">
//                     <div className="grid grid-cols-1  items-start gap-4 lg:grid-cols-2 xl:grid-cols-4 ">
//                         <div className="order-6 col-span-4 grid grid-cols-1 lg:col-span-2">
//                             <section aria-labelledby="section-2-title">
//                                 <h2 id="section-2-title" className="sr-only">
//                                     Engine Performance
//                                 </h2>
//                                 <div className="overflow-visible rounded-lg bg-white shadow">
//                                     <dt className="truncate text-sm font-medium text-gray-500 text-center">
//                                         Engine Performance
//                                     </dt>
//                                     <VitalChart />
//                                 </div>
//                             </section>
//                         </div>
//                         <div className="order-7 col-span-4 grid grid-cols-1 lg:col-span-2">
//                             <section aria-labelledby="section-2-title">
//                                 <h2 id="section-2-title" className="sr-only">
//                                     Driver Activity
//                                 </h2>
//                                 <div className="overflow-visible rounded-lg bg-white shadow">
//                                     <dt className="truncate text-sm font-medium text-gray-500 text-center">
//                                         Driver Activity
//                                     </dt>
//                                     <VitalChart />
//                                 </div>
//                             </section>
//                         </div>
//                     </div>
//                 </div>
//                 <div className="mx-auto max-w-full py-6 ">
//                     <div className="grid grid-cols-1  items-start gap-4 lg:grid-cols-2 xl:grid-cols-4 ">
//                         <div className="order-6 col-span-4 grid grid-cols-1 lg:col-span-2">
//                             <section aria-labelledby="section-2-title">
//                                 <h2 id="section-2-title" className="sr-only">
//                                     G-Force
//                                 </h2>
//                                 <div className="overflow-visible rounded-lg bg-white shadow">
//                                     <dt className="truncate text-sm font-medium text-gray-500 text-center">G-Force</dt>
//                                     <VitalChart />
//                                 </div>
//                             </section>
//                         </div>
//                         <div className="order-7 col-span-4 grid grid-cols-1 lg:col-span-2">
//                             <section aria-labelledby="section-2-title">
//                                 <h2 id="section-2-title" className="sr-only">
//                                     Braking
//                                 </h2>
//                                 <div className="overflow-visible rounded-lg bg-white shadow">
//                                     <dt className="truncate text-sm font-medium text-gray-500 text-center">Braking</dt>
//                                     <VitalChart />
//                                 </div>
//                             </section>
//                         </div>
//                     </div>
//                 </div>
//                 <div className="mx-auto max-w-full py-6 ">
//                     <div className="grid grid-cols-1  items-start gap-4 lg:grid-cols-2 xl:grid-cols-4 ">
//                         <div className="order-6 col-span-4 grid grid-cols-1 lg:col-span-2">
//                             <section aria-labelledby="section-2-title">
//                                 <h2 id="section-2-title" className="sr-only">
//                                     Roll and Pitch Angle
//                                 </h2>
//                                 <div className="overflow-visible rounded-lg bg-white shadow">
//                                     <dt className="truncate text-sm font-medium text-gray-500 text-center">
//                                         Roll and Pitch Angle
//                                     </dt>
//                                     <VitalChart />
//                                 </div>
//                             </section>
//                         </div>
//                     </div>
//                 </div>
//             </div>