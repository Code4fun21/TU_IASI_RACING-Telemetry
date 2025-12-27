import { useEffect, useState, useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useMqttStore } from "../../store/MqttStore";
import { MqttService } from "../../../src/services/MqttServices"; 
import { api } from "../../services/api";
import { transformToColumnar } from "../../services/DataTransformer";

// Components
import MapChart from "../../components/MapChart"; 
import TopActionBar from "./Components/TopActionBar"; 
import MultiLineChart from "../../components/MultiLineChart"; 
import RPMChart from "../../components/RPMChart";
import SpeedChart from "../../components/SpeedChart";
import BrakePressureChart from "../../components/BrakePressureChart";

// Constants
const MAX_DATA_POINTS = 200; 
const ENGINE_SIGNALS = ["rpm", "gear", "throttlePosition", "brakePressure"];
const VITAL_SIGNALS = ["batteryVoltage", "coolantTemp", "manifoldAirPressure"];
const GPS_KEYS = ["GPS_Speed", "GPS_Latitude", "GPS_Longitude"];

// --- 1. DEFINE ALL AVAILABLE SIGNALS FOR THE DROPDOWN ---
const ALL_SIGNALS = [
    ...ENGINE_SIGNALS,
    ...VITAL_SIGNALS,
    ...GPS_KEYS,
    "manifoldAirTemp", "oilPressure", "fuelLevel", "steeringAngle",
    "damperFL", "damperFR", "damperRL", "damperRR",
    "accelerationX", "accelerationY", "accelerationZ",
    "gyroX", "gyroY", "gyroZ"
];
// Remove duplicates just in case
const UNIQUE_SIGNALS = [...new Set(ALL_SIGNALS)].sort();

const formatTime = (ts) => new Date(ts).toLocaleTimeString();

export default function LiveDashboard() {
  const navigate = useNavigate();
  const location = useLocation();
  const { sessionId, trackId } = location.state || {};

  // Store Data
  const isConnected = useMqttStore((state) => state.isConnected);
  const decodedBuffer = useMqttStore((state) => state.decodedBuffer); 
  const clearBuffer = useMqttStore((state) => state.clearBuffer);

  // Local State
  const [saving, setSaving] = useState(false);
  const [trackData, setTrackData] = useState(null);
  const [gates, setGates] = useState([]);
  const [sessionData, setSession] = useState(null);

  // --- 2. NEW STATE FOR CUSTOM CHART ---
  const [staged, setStaged] = useState([]);       // Selected but not charted yet
  const [committed, setCommitted] = useState([]); // Currently displayed on chart

  const readBlobAsText = (blob) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsText(blob);
    });
  };

  // --- INITIALIZATION (Track & Session) ---
  useEffect(() => {
    if (!trackId) return;
    const loadTrackAssets = async () => {
      try {
        const track = await api.getTrackById(trackId);
        console.log(track)
        MqttService.setTrack(track)
        const [gatesBlob, layoutBlob] = await Promise.all([
            api.downloadFile(track.gates),       
            api.downloadFile(track.coordinates)  
        ]);

        const gatesText = await readBlobAsText(gatesBlob);
        const layoutText = await readBlobAsText(layoutBlob);
        const parsedGates = JSON.parse(gatesText);
        const parsedLayout = JSON.parse(layoutText);

        setGates(parsedGates);
        setTrackData({ ...track, coordinates: parsedLayout });

        
      } catch (err) {
        console.error("Failed to load/parse track assets:", err);
      }
    };
    loadTrackAssets();
  }, [trackId]);

  useEffect(() => {
    const loadSessionData = async () => {
      try {
        const session = await api.getSessionById(sessionId);
        setSession(session);
      } catch (err) {
        console.error("Failed to load session data:", err);
      }
    };
    loadSessionData();
  }, [sessionId]);


  // --- CHART DATA PREPARATION ---

  // Generic Helper for Engine/Vital/Custom
  const processDataWithHold = (buffer, signalKeys, validator = null) => {
    const recentBuffer = buffer.slice(-MAX_DATA_POINTS);
    const timestamps = recentBuffer.map(d => formatTime(d.timestamp));
    const result = { timestamps };
    
    const lastKnown = {}; 
    
    signalKeys.forEach(key => {
        result[key] = recentBuffer.map(d => {
            const val = d[key];
            let isValid = val !== undefined && val !== null;
            if (isValid && validator) isValid = validator(val, key);

            if (isValid) {
                lastKnown[key] = val;
                return val;
            }
            return lastKnown[key] ?? null; 
        });
    });
    return result;
  };

  const lineDataEngine = useMemo(() => processDataWithHold(decodedBuffer, ENGINE_SIGNALS), [decodedBuffer]);
  const lineDataVital = useMemo(() => processDataWithHold(decodedBuffer, VITAL_SIGNALS), [decodedBuffer]);

  // GPS Logic (De-coupled Speed)
  const lineDataGPS = useMemo(() => {
    return processDataWithHold(decodedBuffer, GPS_KEYS, (val, key) => {
        if (key === "GPS_Latitude" || key === "GPS_Longitude") {
             return Math.abs(val) > 1.0; // Strict filter for map
        }
        return true; // Speed passes freely
    });
  }, [decodedBuffer]);

  // --- 3. NEW: CUSTOM CHART DATA LOGIC ---
  const lineDataCustom = useMemo(() => {
    if (committed.length === 0) return null;
    // Re-use the robust hold logic for whatever the user selected
    return processDataWithHold(decodedBuffer, committed);
  }, [decodedBuffer, committed]);


  // --- GAUGE DATA ---
  const latestRpm = useMemo(() => {
    if (!lineDataEngine.rpm || lineDataEngine.rpm.length === 0) return 0;
    return lineDataEngine.rpm[lineDataEngine.rpm.length - 1] ?? 0;
  }, [lineDataEngine]);

  const latestBrake = useMemo(() => {
    if (!lineDataEngine.brakePressure || lineDataEngine.brakePressure.length === 0) return 0;
    return lineDataEngine.brakePressure[lineDataEngine.brakePressure.length - 1] ?? 0;
  }, [lineDataEngine]);

  const latestSpeed = useMemo(() => {
    if (!lineDataGPS.GPS_Speed || lineDataGPS.GPS_Speed.length === 0) return 0;
    return lineDataGPS.GPS_Speed[lineDataGPS.GPS_Speed.length - 1] ?? 0;
  }, [lineDataGPS]);


  // --- UI HANDLERS FOR CUSTOM CHART ---
  const handleAddSignal = (e) => {
      const val = e.target.value;
      if (val && !staged.includes(val) && staged.length < 5) {
          setStaged([...staged, val]);
      }
      e.target.value = ""; // Reset dropdown
  };

  const removeStaged = (sig) => {
      setStaged(staged.filter(s => s !== sig));
  };

  const handleCreateChart = () => {
      setCommitted([...staged]);
  };

  // --- STOP & SAVE ---
  const handleStopSession = async () => {
    if (window.confirm("Stop and save session?")) {
        setSaving(true);
        try {
            MqttService.disconnect();
            
            const rawBuffer = useMqttStore.getState().rawBuffer;
            const currentDecoded = useMqttStore.getState().decodedBuffer;

            const rawCsvContent = "timestamp,id,payload\n" + rawBuffer.join("\n");
            const rawBlob = new Blob([rawCsvContent], { type: "text/csv" });
            const rawFile = new File([rawBlob], sessionData.csvFileName);

            const columnarData = transformToColumnar(currentDecoded);
            const decodedJsonContent = JSON.stringify(columnarData);
            const decodedBlob = new Blob([decodedJsonContent], { type: "application/json" });
            const decodedFile = new File([decodedBlob], sessionData.decodedFileName);

            await api.uploadFile(rawFile);
            await api.uploadFile(decodedFile);

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

  // Map Data
  const mapData = useMemo(() => {
    const validPoints = decodedBuffer.filter(p => 
        p.GPS_Longitude && Math.abs(p.GPS_Longitude) > 1.0 && 
        p.GPS_Latitude && Math.abs(p.GPS_Latitude) > 1.0
    );
    if (validPoints.length > 0) {
        const lastPoint = validPoints[validPoints.length - 1];
        return [{
            lon: lastPoint.GPS_Longitude,
            lat: lastPoint.GPS_Latitude,
            speed: lastPoint.GPS_Speed,
            ts: lastPoint.timestamp
        }];
    }
    return [];
  }, [decodedBuffer]);

  return (
    <div className="min-h-screen bg-gray-100 pb-10"> 
      <div className="flex justify-center w-full">
        <TopActionBar sessionId={sessionId} />
      </div>

      <div className="w-full px-4 sm:px-6 lg:px-8 mt-6 space-y-6">
        
        {/* Connection Status */}
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

        {/* --- 4. NEW: BUILD YOUR OWN CHART UI --- */}
        <div className="bg-white p-6 rounded-lg shadow">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Build Your Own Chart</h3>
            
            {/* Controls */}
            <div className="flex flex-wrap items-center gap-4 mb-4">
                <select 
                    className="border border-gray-300 rounded px-3 py-2 text-sm"
                    onChange={handleAddSignal}
                    defaultValue=""
                >
                    <option value="" disabled>Select Signal...</option>
                    {UNIQUE_SIGNALS.map(s => (
                        <option key={s} value={s}>{s}</option>
                    ))}
                </select>

                <button 
                    onClick={handleCreateChart}
                    disabled={staged.length === 0}
                    className="bg-blue-600 text-white px-4 py-2 rounded text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
                >
                    Create Chart
                </button>
                
                <button 
                    onClick={() => { setStaged([]); setCommitted([]); }}
                    className="text-gray-500 text-sm hover:text-gray-700 underline"
                >
                    Clear
                </button>
            </div>

            {/* Tags (Staged Signals) */}
            <div className="flex flex-wrap gap-2 mb-4">
                {staged.map((k) => (
                    <span key={k} className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-3 py-1 text-sm text-blue-800">
                        {k}
                        <button
                            className="ml-1 rounded-full w-5 h-5 flex items-center justify-center hover:bg-blue-200 text-blue-600 font-bold"
                            onClick={() => removeStaged(k)}
                        >
                            ×
                        </button>
                    </span>
                ))}
                {!staged.length && (
                    <span className="text-sm text-gray-400 italic">Pick up to 5 signals...</span>
                )}
            </div>

            {/* The Custom Chart */}
            {committed.length > 0 && lineDataCustom ? (
                <div className="mt-6 border-t pt-4">
                    <MultiLineChart data={lineDataCustom} />
                </div>
            ) : null}
        </div>

        {/* Standard Charts Row */}
        
            <div className="bg-white p-6 rounded-lg shadow">
                <h3 className="text-lg font-medium text-gray-900 text-center mb-4">Engine Signals</h3>
                {decodedBuffer.length > 0 ? <MultiLineChart data={lineDataEngine} /> : <p className="text-center text-gray-400 py-10">Waiting for data...</p>}
            </div>

            <div className="bg-white p-6 rounded-lg shadow">
                <h3 className="text-lg font-medium text-gray-900 text-center mb-4">Live Telemetry</h3>
                {decodedBuffer.length > 0 ? <MultiLineChart data={lineDataVital} /> : <p className="text-center text-gray-400 py-10">Waiting for data...</p>}
            </div>
        

        {/* GPS Chart */}
        <div className="bg-white p-6 rounded-lg shadow">
            <h3 className="text-lg font-medium text-gray-900 text-center mb-4">GPS Data</h3>
            {decodedBuffer.length > 0 ? (
                <MultiLineChart data={lineDataGPS} />
            ) : (
                <p className="text-center text-gray-400 py-10">Waiting for GPS data...</p>
            )}
        </div>

        {/* Live Map */}
        <div className="bg-white p-6 rounded-lg shadow h-[600px] relative">
            <h3 className="text-lg font-medium text-gray-900 text-center mb-4">Live Map</h3>
            {trackData ? (
                <MapChart 
                    geoData={trackData.coordinates} 
                    data={mapData} 
                    gates={gates}  
                    height={500} 
                    // rotation={-90} 
                />
            ) : (
                <div className="flex items-center justify-center h-full text-gray-500 animate-pulse">Loading Track Layout...</div>
            )}
        </div>  

        {/* Gauges */}
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            <div className="bg-white p-4 shadow rounded-lg flex justify-center">
                <RPMChart data={latestRpm} height={300} width={300} />
            </div>
            <div className="bg-white p-4 shadow rounded-lg flex justify-center">
                <SpeedChart data={latestSpeed} height={300} width={300} />
            </div>
            <div className="bg-white p-4 shadow rounded-lg flex flex-col items-center justify-center">
                <h4 className="text-sm font-medium text-gray-500 mb-2">Brake Pressure</h4>
                <BrakePressureChart data={latestBrake} height={200} width={300} />
            </div>
        </div>

      </div>
    </div>
  );
}