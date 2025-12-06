import { useEffect, useState, useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useMqttStore } from "../../store/MqttStore";
import { MqttService } from "../../services/MqttServices";
import { api } from "../../services/api";
import Papa from "papaparse";

// Components
// import ChartWrapper from "../../components/ChartWrapper"; 
import MapChart from "../../components/MapChart";
import TopActionBar from "./Components/TopActionBar";
import MultiLineChart from "../../components/MultiLineChart"; 
import RPMChart from "../../components/RPMChart";
import SpeedChart from "../../components/SpeedChart";
import BrakePressureChart from "../../components/BrakePressureChart";

// Constants for Charts
const ENGINE_SIGNALS = ["rpm", "gear", "throttlePosition", "brakePressure"];
const VITAL_SIGNALS = ["batteryVoltage", "coolantTemp", "manifoldAirPressure"];

export default function LiveDashboard() {
  const navigate = useNavigate();
  const location = useLocation();
  
  // 1. Session Info
  const { sessionId, trackId } = location.state || {};

  // 2. MQTT Store Data
  const isConnected = useMqttStore((state) => state.isConnected);
  const currentData = useMqttStore((state) => state.currentData) || {}; // Default to empty object to prevent crashes
  const dataBuffer = useMqttStore((state) => state.dataBuffer);
  const clearBuffer = useMqttStore((state) => state.clearBuffer);

  // 3. Local State
  const [saving, setSaving] = useState(false);
  const [trackData, setTrackData] = useState(null);
  const [gates, setGates] = useState([]);

  // --- SAFETY CHECK: Redirect if missing session ---
  useEffect(() => {
    if (!sessionId || !trackId) {
      console.warn("Missing session/track ID. Redirecting to start...");
      // navigate("/mqtt-auth"); // Uncomment this when you are ready to enforce flow
    }
  }, [sessionId, trackId, navigate]);

  // --- FETCH TRACK DATA ---
  useEffect(() => {
    if (!trackId) return;

    api.getTrackById(trackId)
      .then((track) => {
        try {
          // Parse Gates
          let parsedGates = [];
          if (typeof track.gates === 'string') {
            parsedGates = JSON.parse(track.gates);
          } else if (Array.isArray(track.gates)) {
            parsedGates = track.gates;
          }
          setGates(parsedGates);

          // Parse Layout
          let parsedLayout = null;
          if (typeof track.coordinates === 'string') {
             parsedLayout = JSON.parse(track.coordinates);
          } else {
             parsedLayout = track.coordinates;
          }
          
          setTrackData({ ...track, coordinates: parsedLayout });

        } catch (e) {
          console.error("Error parsing Track JSON:", e);
        }
      })
      .catch((err) => console.error("Failed to load track:", err));
  }, [trackId]);

  // --- PREPARE DATA FOR CHARTS ---
  // Convert the Zustand buffer into the format your MultiLineCharts expect
  const lineDataEngine = useMemo(() => {
    const timestamps = dataBuffer.map(d => new Date(d.timestamp).toLocaleTimeString());
    const result = { timestamps };
    
    ENGINE_SIGNALS.forEach(key => {
        result[key] = dataBuffer.map(d => d[key] ?? 0);
    });
    return result;
  }, [dataBuffer]);

  const lineDataVital = useMemo(() => {
    const timestamps = dataBuffer.map(d => new Date(d.timestamp).toLocaleTimeString());
    const result = { timestamps };
    
    VITAL_SIGNALS.forEach(key => {
        result[key] = dataBuffer.map(d => d[key] ?? 0);
    });
    return result;
  }, [dataBuffer]);

  // Prepare Map Data
  const mapData = useMemo(() => {
    return dataBuffer
      .filter(p => p.GPS_Longitude && p.GPS_Latitude)
      .map(p => ({
         lon: p.GPS_Longitude,
         lat: p.GPS_Latitude,
         speed: p.GPS_Speed,
         ts: p.timestamp
      }));
  }, [dataBuffer]);


  // --- STOP & SAVE ---
  const handleStopSession = async () => {
    if (window.confirm("Stop and save session?")) {
        setSaving(true);
        try {
            MqttService.disconnect();
            
            const csv = Papa.unparse(dataBuffer);
            const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
            const fileName = `Session_${sessionId}_${Date.now()}.csv`;
            const file = new File([blob], fileName, { type: "text/csv" });

            await api.uploadFile(file);
            alert("Session Saved Successfully!");
            clearBuffer();
            navigate("/");
        } catch (error) {
            console.error(error);
            alert("Error saving session.");
        } finally {
            setSaving(false);
        }
    }
  };

  return (
    <div className="min-h-screen bg-gray-800/75"> {/* Light bg to match your components */}
      <div className="flex justify-center w-full">
        <TopActionBar sessionId={sessionId} />
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-6 space-y-6">
        
        {/* Connection Status Banner */}
        <div className={`p-4 rounded-lg shadow-sm border-l-4 ${isConnected ? "bg-green-50 border-green-500" : "bg-red-50 border-red-500"}`}>
            <div className="flex justify-between items-center">
                <p className="font-bold text-gray-700">
                    Status: <span className={isConnected ? "text-green-600" : "text-red-600"}>{isConnected ? "Connected to Car" : "Disconnected"}</span>
                </p>
                <button 
                    onClick={handleStopSession} 
                    disabled={saving}
                    className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded text-sm font-bold shadow"
                >
                    {saving ? "Saving..." : "Stop & Save"}
                </button>
            </div>
        </div>

        {/* 1. Charts Row */}
        <div className="bg-gray-100/65 p-6 rounded-lg shadow">
            <h3 className="text-lg font-medium text-gray-900 text-center mb-4">Engine Signals</h3>
            {/* Guard against empty data */}
            {dataBuffer.length > 0 ? (
                <MultiLineChart data={lineDataEngine} />
            ) : (
                <p className="text-center text-black-400 py-10">Waiting for data...</p>
            )}
        </div>

        <div className="bg-gray-100/65 p-6 rounded-lg shadow">
            <h3 className="text-lg font-medium text-gray-900 text-center mb-4">Live Telemetry Analysis</h3>
            {dataBuffer.length > 0 ? (
                <MultiLineChart data={lineDataVital} />
            ) : (
                <p className="text-center text-gray-900 py-10">Waiting for data...</p>
            )}
        </div>

        {/* 2. Map Row */}
        <div className="bg-gray-100/65 p-6 rounded-lg shadow h-[600px] relative">
            <h3 className="text-lg font-medium text-gray-900 text-center mb-4">Live Map</h3>
            {/* THE FIX IS HERE: We check if trackData exists before rendering */}
            {trackData ? (
                <MapChart 
                    geoData={trackData.coordinates} 
                    data={mapData} 
                    gates={gates}  
                    height={500} 
                    rotation={90} 
                />
            ) : (
                <div className="flex items-center justify-center h-full text-gray-500 animate-pulse">
                    Loading Track Layout...
                </div>
            )}
        </div>  

        {/* 3. Gauges Row */}
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            <div className="bg-gray-100/65 p-4 shadow rounded-lg flex justify-center">
                <RPMChart data={currentData.rpm || 0} height={300} width={300} />
            </div>
            <div className="bg-gray-100/65 p-4 shadow rounded-lg flex justify-center">
                <SpeedChart data={currentData.GPS_Speed || 0} height={300} width={300} />
            </div>
            <div className="bg-gray-100/65 p-4 shadow rounded-lg flex flex-col items-center justify-center">
                <h4 className="text-sm font-medium text-gray-500 mb-2">Brake Pressure</h4>
                <BrakePressureChart data={currentData.brakePressure || 0} height={200} width={300} />
            </div>
        </div>

      </div>
    </div>
  );
}