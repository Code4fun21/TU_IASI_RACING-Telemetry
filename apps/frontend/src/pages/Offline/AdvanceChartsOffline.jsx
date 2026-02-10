import { useEffect, useMemo, useState } from "react";
import * as echarts from "echarts";
import { useTelemetry } from "../../store/OfflineDataStoreadge"; // Check spelling of this path

import TimestampSelect from "../MQTT/Components/TimestampSelect";
import VitalChart from "../MQTT/MoreCharts/Charts/VitalChart";
import GGChart from "../MQTT/MoreCharts/Charts/GGChart"

// Helper remains the same
const processSeries = (dataPairArray) => {
    if (!dataPairArray || dataPairArray.length === 0) return { times: [], values: [] };
    const times = dataPairArray.map(pt => pt[0]);
    const values = dataPairArray.map(pt => pt[1]);
    return { times, values };
};


const prepareGGData = (accelX, accelY) => {
    if (!accelX || !accelY || accelX.length === 0 || accelY.length === 0) return [];

    // Simple synchronization: Assume timestamps match closely enough or use the index if synced by decoder
    // Since they come from the same CAN frame (usually 0x118), indices usually align.
    const points = [];
    const len = Math.min(accelX.length, accelY.length);
    
    for (let i = 0; i < len; i++) {
        // [Lateral G (Y-axis sensor), Longitudinal G (X-axis sensor)]
        // Standard G-G diagram: X-axis = Lateral, Y-axis = Longitudinal
        points.push([
            accelY[i][1], // Lateral G (Left/Right)
            accelX[i][1]  // Longitudinal G (Accel/Brake)
        ]);
    }
    return points;
};

export default function AdvanceChartsOffline() {
    // --- 1. MOVED HOOKS INSIDE THE COMPONENT ---
    const GROUP_ID = "syncGroup";
    
    // Get data directly from context
    const { telemetryData, sessionInfo } = useTelemetry();     
    
    // You likely need these states for your selectors later
    const [selectedTs, setSelectedTs] = useState(null);
    const [selectedLap, setSelectedLap] = useState(null);

    // --- 2. REMOVED REDUNDANT STATE SETTERS ---
    // You don't need setTelemetry(telemetryData). Just use 'telemetryData'.

    // Safety check
    console.log(telemetryData)
    if (!telemetryData) {
        return (
            <div className="p-10 text-center text-gray-500">
                <p>No telemetry data loaded.</p>
                <p className="text-sm mt-2">Go back to Dashboard and load a file first.</p>
            </div>
        );
    }

    const gatesArray = useMemo(() => {
        // Safety check to ensure data exists
        if (!telemetryData.Gates_times?.lap_data) return [];

        return telemetryData.Gates_times.lap_data.map((lap, index) => ({
            label: `Lap ${index + 1}`,
            index: index,
            // 1. ADD THESE LINES SO THE FILTER WORKS:
            startTime: lap.S0, 
            endTime: lap.S3 || lap.ts 
        }));
    }, [telemetryData]);

const filtered = useMemo(() => {
        let minTime = -Infinity;
        let maxTime = Infinity;
        let isFiltering = false;

        // PRIORITIZE LAP SELECTION
        if (selectedLap !== null && gatesArray[selectedLap]) {
            const lap = gatesArray[selectedLap];
            minTime = lap.startTime;
            maxTime = lap.endTime;
            isFiltering = true;
        } 
        // FALLBACK TO STINT SELECTION
        else if (selectedTs) {
            // Ensure we compare seconds to seconds
            // If selectedTs strings are ISO dates, convert to seconds
            minTime = Number(selectedTs.startTime); 
            maxTime = Number(selectedTs.endTime);
            isFiltering = true;
        }

        // If no filter is active, return all data immediately (performance opt)
        if (!isFiltering) return telemetryData;

        const newFiltered = {};
        
        // Loop through all data series (RPM, Speed, etc.)
        Object.keys(telemetryData).forEach(key => {
            // Always keep the Gates/Laps data intact so we don't break the lap selector
            if (key === "Gates_times") {
                newFiltered[key] = telemetryData[key];
                return;
            }

            const seriesData = telemetryData[key];

            // Only filter arrays (the actual sensor data)
            if (Array.isArray(seriesData)) {
                 // Keep points strictly within the time window
                 newFiltered[key] = seriesData.filter(pt => {
                     const t = pt[0]; // Timestamp is index 0
                     return t >= minTime && t <= maxTime;
                 });
            } else {
                 // Pass through non-array objects (meta data)
                 newFiltered[key] = seriesData;
            }
        });

        return newFiltered;
    }, [telemetryData, selectedLap, selectedTs, gatesArray]);
    useEffect(() => {
        echarts.connect(GROUP_ID);
    }, []);


        // --- 3. Use telemetryData directly ---
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

    const ggData = useMemo(() => {
        // Use the LPF filtered data we created in the decoder
        // Note: Make sure 'Acceleration_on_X_axis' exists in your filtered data
        const accX = filtered.Acceleration_on_X_axis;
        const accY = filtered.Acceleration_on_Z_axis;

        if (!accX || !accY) return [];

        return prepareGGData(accX, accY);
    }, [filtered]);

   

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
            
            {/* Chart */}
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
            {ggData && ggData.length > 0 && (
                    <div className="rounded-lg bg-white p-4 shadow">
                        <GGChart data={ggData} height={350} />
                    </div>
                )}
            
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