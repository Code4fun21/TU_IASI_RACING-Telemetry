import { useEffect, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useTelemetry } from "../store/OfflineDataStoreadge";

// --- COMPONENTS ---
import VitalChart from "./MQTT/MoreCharts/Charts/VitalChart";

// --- CONSTANTS ---
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

export default function DashboardDebug() {
    const location = useLocation();
    const navigate = useNavigate();
    
    // 1. Grab BOTH the setters AND the existing data from your global store
    const { setTelemetryData, setSessionInfo, telemetryData, sessionInfo } = useTelemetry();
    
    // 2. Check if we just arrived from the FileActionModal (fresh file)
    const { fileData, session: navSession } = location.state || {};
    const currentSession = navSession || sessionInfo;

    const rawData = useMemo(() => {
        if (fileData && Array.isArray(fileData.rows)) return fileData.rows;
        if (Array.isArray(fileData)) return fileData;
        return [];
    }, [fileData]);

    // 3. Parse Raw Data (Only runs if a fresh file was passed in location.state)
    const parsedData = useMemo(() => {
        if (!rawData || rawData.length === 0) return null; // Return null to fall back to global store

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
                "Average_fuel_flow": "averageFuelFlow", "Distance": "Distance",
                "Acceleration_on_X_axis_rotated": "accelerationX_rotated", 
                "Acceleration_on_Y_axis_rotated": "accelerationY_rotated",
                "Acceleration_on_Z_axis_rotated": "accelerationZ_rotated", 
                "Acceleration_on_X_axis_RAW": "accelerationX_RAW", 
                "Acceleration_on_Y_axis_RAW": "accelerationY_RAW",
                "Acceleration_on_Z_axis_RAW": "accelerationZ_RAW", 
            };
            
            const sourceKey = keyMap[targetKey] || targetKey;
            const result = [];

            for (let i = 0; i < rawData.length; i++) {
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

        return {
            RPM: extract("RPM"), 
            Manifold_air_pressure: extract("Manifold_air_pressure"),
            Manifold_air_temperature: extract("Manifold_air_temperature"), 
            Coolant_temperature: extract("Coolant_temperature"),
            Throttle_position: extract("Throttle_position"), 
            Battery_voltage: extract("Battery_voltage"),
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
            Acceleration_on_X_axis_rotated: extract("Acceleration_on_X_axis_rotated"), 
            Acceleration_on_Y_axis_rotated: extract("Acceleration_on_Y_axis_rotated"),
            Acceleration_on_Z_axis_rotated: extract("Acceleration_on_Z_axis_rotated"), 
            Acceleration_on_X_axis_RAW: extract("Acceleration_on_X_axis_RAW"), 
            Acceleration_on_Y_axis_RAW: extract("Acceleration_on_Y_axis_RAW"),
            Acceleration_on_Z_axis_RAW: extract("Acceleration_on_Z_axis_RAW"), 
        };
    }, [rawData]);

    // 4. Determine Active Data: Use newly parsed data if it exists, otherwise use the global store!
    const activeData = parsedData || telemetryData;

    // 5. Save Context (Only if we just parsed fresh data)
    useEffect(() => {
        if (parsedData && currentSession?.id) {
            setTelemetryData(parsedData); 
            setSessionInfo(currentSession);    
        }
    }, [parsedData, currentSession, setTelemetryData, setSessionInfo]);

    // --- DEBUGGING ACTION ---
    const handlePrintData = () => {
        console.log("=== CURRENT ACTIVE DATA OBJECT ===");
        console.log(activeData);
        alert("Data object printed to the browser console (Press F12 to view)");
    };

    // ==========================================
    // RENDER CHARTS
    // ==========================================
    
    const activeCharts = useMemo(() => {
        if (!activeData) return [];
        
        return SIGNAL_SPECS.map(([label, key, unit]) => {
            const seriesData = activeData[key];
            
            if (!seriesData || seriesData.length === 0) return null;

            const timeStamps = seriesData.map(pt => pt[0]);
            const values = seriesData.map(pt => pt[1]);

            return (
                <div key={key} className="rounded-lg bg-white p-4 shadow">
                    <div className="flex items-center justify-between mb-2">
                        <h3 className="font-bold text-gray-800">{label}</h3>
                        <span className="text-xs font-mono bg-gray-100 text-gray-500 px-2 py-1 rounded border border-gray-200">
                            Key: {key}
                        </span>
                    </div>
                    <VitalChart
                        dateTime={timeStamps}
                        series={[{ name: label, data: values, unit: unit }]}
                        height={250}
                    />
                </div>
            );
        }).filter(Boolean); 
    }, [activeData]);

    return (
        <div className="p-4 space-y-6 bg-gray-50 min-h-screen">
            
            {/* NAVIGATION & DEBUG HEADER */}
            <div className="bg-white p-6 rounded-lg shadow-sm border-l-4 border-indigo-500 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-black text-gray-900">Telemetry Debug View</h1>
                    <p className="text-gray-500 mt-1">
                        Showing {activeCharts.length} active signals.
                    </p>
                    <div className="mt-2 text-sm text-gray-400 font-mono">
                        Session: {currentSession?.csvFileName || "Loaded from Store"}
                    </div>
                </div>
                
                <div className="flex flex-wrap gap-2">
                    <button 
                        onClick={handlePrintData}
                        className="bg-amber-100 text-amber-800 border border-amber-300 px-4 py-2 rounded font-medium hover:bg-amber-200"
                    >
                        Print Data Object
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {activeCharts.length > 0 ? (
                    activeCharts
                ) : (
                    <div className="col-span-full p-12 text-center text-gray-400 bg-white rounded-lg border border-dashed border-gray-300">
                        No valid signals found in this session. Return to the dashboard and load a file.
                    </div>
                )}
            </div>
        </div>
    );
}