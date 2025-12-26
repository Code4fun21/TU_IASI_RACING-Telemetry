import { useEffect, useState, useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useMqttStore } from "../../store/MqttStore";
import { MqttService } from "../../../src/services/MqttServices"; // Ensure filename matches (Singular)
import { api } from "../../services/api";
import Papa from "papaparse";
import { transformToColumnar } from "../../services/DataTransformer";
// Components
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
  const currentData = useMqttStore((state) => state.currentData) || {}; 
  
  // FIX 1: Read 'decodedBuffer' instead of 'dataBuffer'
  const decodedBuffer = useMqttStore((state) => state.decodedBuffer); 
  
  const clearBuffer = useMqttStore((state) => state.clearBuffer);

  // 3. Local State
  const [saving, setSaving] = useState(false);
  const [trackData, setTrackData] = useState(null);
  const [gates, setGates] = useState([]);

  const [sessionData,setSession]=useState(null)

  const readBlobAsText = (blob) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsText(blob);
    });
  };

  // --- SAFETY CHECK ---
 useEffect(() => {
    if (!trackId) return;

    const loadTrackAssets = async () => {
      try {
        const track = await api.getTrackById(trackId);
        
        // 1. Fetch Blobs
        const [gatesBlob, layoutBlob] = await Promise.all([
            api.downloadFile(track.gates),       
            api.downloadFile(track.coordinates)  
        ]);

        // 2. Convert Blobs to Text Strings
        const gatesText = await readBlobAsText(gatesBlob);
        const layoutText = await readBlobAsText(layoutBlob);

        // 3. Parse JSON
        const parsedGates = JSON.parse(gatesText);
        const parsedLayout = JSON.parse(layoutText);

        // 4. Set State
        setGates(parsedGates);
        setTrackData({ ...track, coordinates: parsedLayout });

        MqttService.setTrack(trackData)

      } catch (err) {
        console.error("Failed to load/parse track assets:", err);
      }
    };

    loadTrackAssets();
  }, [trackId]);

  useEffect(()=>{
    const loadSessionData= async()=>{
      try{
        const session=  await api.getSessionById(sessionId);
        setSession(session)
      }
      catch (err) {
        console.error("Failed to load session data:", err);
      }
    }
    loadSessionData();
  },[sessionId])

  

  // --- PREPARE DATA FOR CHARTS ---
  // FIX 2: Use 'decodedBuffer' for all calculations
  const lineDataEngine = useMemo(() => {
    const timestamps = decodedBuffer.map(d => new Date(d.timestamp).toLocaleTimeString());
    const result = { timestamps };
    ENGINE_SIGNALS.forEach(key => {
        result[key] = decodedBuffer.map(d => d[key] ?? 0);
    });
    return result;
  }, [decodedBuffer]);

  const lineDataVital = useMemo(() => {
    const timestamps = decodedBuffer.map(d => new Date(d.timestamp).toLocaleTimeString());
    const result = { timestamps };
    VITAL_SIGNALS.forEach(key => {
        result[key] = decodedBuffer.map(d => d[key] ?? 0);
    });
    return result;
  }, [decodedBuffer]);

  // Prepare Map Data
  const mapData = useMemo(() => {
    return decodedBuffer
      .filter(p => p.GPS_Longitude && p.GPS_Latitude)
      .map(p => ({
         lon: p.GPS_Longitude,
         lat: p.GPS_Latitude,
         speed: p.GPS_Speed,
         ts: p.timestamp
      }));
  }, [decodedBuffer]);


  // --- STOP & SAVE ---
  const handleStopSession = async () => {
    if (window.confirm("Stop and save session?")) {
        setSaving(true);
        try {
            MqttService.disconnect();
            
            const timestamp = Date.now();

            // FIX 3: Get RAW buffer directly from store state for saving
            const rawBuffer = useMqttStore.getState().rawBuffer;
            const currentDecoded = useMqttStore.getState().decodedBuffer;

            // 1. Prepare RAW File (.csv)
            // Join array of strings with newlines
            const rawCsvContent = "timestamp,id,payload\n" + rawBuffer.join("\n");
            const rawBlob = new Blob([rawCsvContent], { type: "text/csv" });
            const rawFileName = sessionData.csvFileName;
            const rawFile = new File([rawBlob], rawFileName);

            // 2. Prepare DECODED File (.json)
            const columnarData = transformToColumnar(useMqttStore.getState().decodedBuffer);
            const decodedJsonContent = JSON.stringify(columnarData);
            const decodedBlob = new Blob([decodedJsonContent], { type: "application/json" });
            const decodedFileName = sessionData.decodedFileName;
            const decodedFile = new File([decodedBlob], decodedFileName);

            // 3. Upload Both
            await api.uploadFile(rawFile);
            await api.uploadFile(decodedFile);

            // Note: If you need to update the session in the DB with these new filenames,
            // you would call an update API here. For now, we just upload them.
            console.log("Saved Raw:", rawFileName);
            console.log("Saved Decoded:", decodedFileName);

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
    <div className="min-h-screen bg-gray-100 pb-10"> 
      <div className="flex justify-center w-full">
        <TopActionBar sessionId={sessionId} />
      </div>

      <div className="w-full px-4 sm:px-6 lg:px-8 mt-6 space-y-6">
        
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
        <div className="bg-white p-6 rounded-lg shadow">
            <h3 className="text-lg font-medium text-gray-900 text-center mb-4">Engine Signals</h3>
            {decodedBuffer.length > 0 ? (
                <MultiLineChart data={lineDataEngine} />
            ) : (
                <p className="text-center text-gray-400 py-10">Waiting for data...</p>
            )}
        </div>

        <div className="bg-white p-6 rounded-lg shadow">
            <h3 className="text-lg font-medium text-gray-900 text-center mb-4">Live Telemetry Analysis</h3>
            {decodedBuffer.length > 0 ? (
                <MultiLineChart data={lineDataVital} />
            ) : (
                <p className="text-center text-gray-400 py-10">Waiting for data...</p>
            )}
        </div>

        {/* 2. Map Row */}
        <div className="bg-white p-6 rounded-lg shadow h-[600px] relative">
            <h3 className="text-lg font-medium text-gray-900 text-center mb-4">Live Map</h3>
            {trackData ? (
                <MapChart 
                    geoData={trackData.coordinates} 
                    data={mapData} 
                    gates={gates}  
                    height={500} 
                    rotation={-90} 
                />
            ) : (
                <div className="flex items-center justify-center h-full text-gray-500 animate-pulse">
                    Loading Track Layout...
                </div>
            )}
        </div>  

        {/* 3. Gauges Row */}
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            <div className="bg-white p-4 shadow rounded-lg flex justify-center">
                <RPMChart data={currentData.rpm || 0} height={300} width={300} />
            </div>
            <div className="bg-white p-4 shadow rounded-lg flex justify-center">
                <SpeedChart data={currentData.GPS_Speed || 0} height={300} width={300} />
            </div>
            <div className="bg-white p-4 shadow rounded-lg flex flex-col items-center justify-center">
                <h4 className="text-sm font-medium text-gray-500 mb-2">Brake Pressure</h4>
                <BrakePressureChart data={currentData.brakePressure || 0} height={200} width={300} />
            </div>
        </div>

      </div>
    </div>
  );
}