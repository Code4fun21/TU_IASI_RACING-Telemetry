import { useEffect, useState, useRef } from "react";
import { useNavigate,useLocation } from "react-router-dom";
import { useSocket } from "../../context/SocketContext";
import { api } from "../../services/api";
// import { useMqttStore } from "../../store/MqttStore"; // The new store
// import { MqttService } from "../../services/MqttService";
import { useMqttStore } from "../../store/MqttStore";
import { MqttService } from "../../services/MqttServices";
import Papa from "papaparse";


import RPMChart from "../../components/RPMChart";
import SpeedChart from "../../components/SpeedChart";
import BrakePressureChart from "../../components/BrakePressureChart";
import MapChart from "../../components/MapChart";
import TopActionBar from "./Components/TopActionBar";
import MultiLineChart from "../../components/MultiLineChart";
import VitalChart from "./MoreCharts/Charts/VitalChart";

const MAX_DATA_POINTS = 200;
const MAX_MAP_POINTS = 500;

const initialLatestData = {
  rpm: 0,
  coolantTemp: 0,
  batteryVoltage: 0,
  throttlePosition: 0,
  gear: 0,
  brakePressure: 0,
  GPS_Speed: 0,
  GPS_Longitude: 0,
  GPS_Latitude: 0,
  manifoldAirPressure: 0,
  manifoldAirTemp: 0,
  airDensityCorrection: 0,
  warmupCorrection: 0,
  tpsBasedAcceleration: 0,
  tpsBasedFuelCut: 0,
  totalFuelCorrection: 0,
  veBank1: 0,
  veBank2: 0,
  coldAdvance: 0,
  tpsRateChange: 0,
  rpmRateChange: 0,
  syncLossCounter: 0,
  syncLossReason: 0,
  fuelFlow: 0,
  damperLR: 0,
  damperRR: 0,
  bspd: 0,
  damperLF: 0,
  damperRF: 0,
  steering: 0,
  accelerationX: 0,
  accelerationY: 0,
  accelerationZ: 0,
};
const initialLineData = {
  timestamps: [],
  rpm: [],
  coolantTemp: [],
  batteryVoltage: [],
  throttlePosition: [],
  gear: [],
  brakePressure: [],
  GPS_Speed: [],
  GPS_Longitude: [],
  GPS_Latitude: [],
  manifoldAirPressure: [],
  manifoldAirTemp: [],
  airDensityCorrection: [],
  warmupCorrection: [],
  tpsBasedAcceleration: [],
  tpsBasedFuelCut: [],
  totalFuelCorrection: [],
  veBank1: [],
  veBank2: [],
  coldAdvance: [],
  tpsRateChange: [],
  rpmRateChange: [],
  syncLossCounter: [],
  syncLossReason: [],
  fuelFlow: [],
  damperLR: [],
  damperRR: [],
  bspd: [],
  damperLF: [],
  damperRF: [],
  steering: [],
  accelerationX: [],
  accelerationY: [],
  accelerationZ: [],
};
// instead of your old ENGINE_SIGNALS...
const ENGINE_SIGNALS = [
  "rpm",
  "gear",
  "throttlePosition",
  "brakePressure",
];

// add a new VITAL_SIGNALS array:
const VITAL_SIGNALS = [
  "batteryVoltage",
  "coolantTemp",
  "manifoldAirPressure",      // MAP
  "manifoldAirTemp",          // MAT
  // feel free to “…,” add other session‐critical keys here
];

const GPS_SIGNALS = [
  "GPS_Speed",
  "GPS_Longitude",
  "GPS_Latitude",
];
export default function LiveDashboard() {

  const socket = useSocket();
  // grab sessionId from navigation state
  const navigate = useNavigate();
  const location = useLocation();
  const { sessionId, trackId } = location.state || {};
  // console.log("LiveDashboard mounted with:", { sessionId, trackId });
  if (!sessionId) {
    console.warn("LiveDashboard mounted without sessionId!");
  }
  const isConnected = useMqttStore((state) => state.isConnected);
  const currentData = useMqttStore((state) => state.currentData); // Latest point for gauges/text
  const dataBuffer = useMqttStore((state) => state.dataBuffer);   // Full history for saving
  const clearBuffer = useMqttStore((state) => state.clearBuffer);

  const [saving, setSaving] = useState(false);

  // 3. Safety Check: If refreshed, we might lose connection. 
  // Optionally redirect back to auth if disconnected.
  useEffect(() => {
    if (!isConnected) {
      console.warn("MQTT Disconnected. Redirecting...");
      // navigate("/mqtt-auth"); // Uncomment to enforce auth
    }
  }, [isConnected, navigate]);

  const handleStopSession = async () => {
    if (window.confirm("Are you sure you want to stop and save this session?")) {
        setSaving(true);
        
        try {
            // A. Disconnect MQTT
            MqttService.disconnect();

            // B. Convert Buffer to CSV
            // We use Papaparse to unparse (JSON -> CSV)
            const csv = Papa.unparse(dataBuffer);
            const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
            
            // Create a File object
            const fileName = `Session_${sessionId}_${Date.now()}.csv`;
            const file = new File([blob], fileName, { type: "text/csv" });

            // C. Upload the File to R2
            // We use the existing API we built in Step 5!
            const storedFileName = await api.uploadFile(file);

            // D. Update Metadata (Optional but recommended)
            // If you want to update the 'endTime' or 'csvFileName' in the DB for this session
            // You might need a new API endpoint: PATCH /api/sessions/:id
            console.log("File uploaded to:", storedFileName);

            alert("Session Saved Successfully!");
            clearBuffer(); // Clean up memory
            navigate("/"); // Go Home

        } catch (error) {
            console.error("Failed to save session:", error);
            alert("Error saving session. Check console.");
        } finally {
            setSaving(false);
        }
    }
  };

  const [trackData, setTrackData] = useState(null);
  const [gates, setGates] = useState([]);

  // Fetch the track (with its gates JSON)
  useEffect(() => {
    if (!trackId) return;

    api.getTrackById(trackId)
      .then(async (res) => {
        const track = res;
       try {
          // --- 1. HANDLE GATES ---
          // The DB sends gates as a JSON string: '[{"name":"S0",...}]'
          // We convert it to a real Array.
          let parsedGates = [];
          if (typeof track.gates === 'string') {
            parsedGates = JSON.parse(track.gates);
          } else if (Array.isArray(track.gates)) {
            parsedGates = track.gates;
          }
          setGates(parsedGates);

          // --- 2. HANDLE LAYOUT (Coordinates) ---
          // The DB sends coordinates as a JSON string: '{"type":"FeatureCollection",...}'
          // We convert it to a real Object.
          let parsedLayout = track.coordinates;
          if (typeof track.coordinates === 'string') {
             parsedLayout = JSON.parse(track.coordinates);
          }

          // --- 3. SET STATE ---
          // We update trackData so 'coordinates' is now an Object, not a String
          setTrackData({ ...track, coordinates: parsedLayout });

        } catch (err) {
          console.error("Error parsing JSON data from DB:", err);
          setGates([]); 
        }
      })
  }, [trackId]);


  useEffect(()=>{
    if(!gates) return;
    console.log(gates)
  },[gates])
useEffect(()=>{
    if(!trackData) return;
    console.log(trackData)
  },[trackData])
  const prev = useRef({ rpm: 0, GPS_Speed: 0, brakePressure: 0 });
  const [latestTelemetry, setLatestTelemetry] = useState(initialLatestData);

  const [lineDataEngine, setLineDataEngine] = useState({
  timestamps: [],
  ...ENGINE_SIGNALS.reduce((acc, k) => ({ ...acc, [k]: [] }), {}),
  });

  const [lineDataVital, setLineDataVital] = useState({
    timestamps: [],
    ...VITAL_SIGNALS.reduce((acc, k) => ({ ...acc, [k]: [] }), {}),
  });

  const [LineDataGPS, setLineDataGPS] = useState({
    timestamps: [],
    ...GPS_SIGNALS.reduce((acc, k) => ({ ...acc, [k]: [] }), {}),
  });

  const [mapData, setMapData] = useState([]);
  const lastValidMapPoint = useRef(null);

  

  useEffect(() => {
    if (!socket) return;
    console.log("[Dashboard] socket ready:", socket.id);

    // Handler MUST use the same name as the server emit: 'message'
    const handleTelemetryUpdate = (data) => {
    // if there’s lap_data, log that explicitly
    
    if (data.lap_data) {
      console.log("[Dashboard] lap_data object:\n", data.lap_data);
      setMapData([]);
    }
      if (!data.values) return;

      // parse timestamp (server sends seconds)
      const timestampMs = Number(data.timestamp) * 1000;
      const newTime = new Date(timestampMs)
        .toLocaleTimeString("en-US", { hour12: false });

      const v = data.values;
      // map to your internal keys
      const mapped = {
        rpm: v.RPM ?? null,
        coolantTemp: v.Coolant_temperature ?? null,
        batteryVoltage: v.Battery_voltage ?? null,
        throttlePosition: v.Throttle_position ?? null,
        gear: v.Gear ?? null,
        brakePressure: v.Brake_Pressure ?? null,
        GPS_Speed: v.GPS_Speed ?? null,
        GPS_Longitude: v.GPS_Longitude ?? null,
        GPS_Latitude: v.GPS_Latitude ?? null,
        manifoldAirPressure: v.Manifold_air_pressure ?? null,
        manifoldAirTemp: v.Manifold_air_temperature ?? null,
        airDensityCorrection: v.Air_density_correction ?? null,
        warmupCorrection: v.Warmup_correction ?? null,
        tpsBasedAcceleration: v.TPS_based_acceleration ?? null,
        tpsBasedFuelCut: v.TPS_based_fuel_cut ?? null,
        totalFuelCorrection: v.Total_fuel_correction ?? null,
        veBank1: v.VE_value_table_bank1 ?? null,
        veBank2: v.VE_value_table_bank2 ?? null,
        coldAdvance: v.Cold_advance ?? null,
        tpsRateChange: v.Rate_of_change_of_TPS ?? null,
        rpmRateChange: v.Rate_of_change_of_RPM ?? null,
        syncLossCounter: v.Sync_loss_counter ?? null,
        syncLossReason: v.Sync_loss_reason_code ?? null,
        fuelFlow: v.Average_fuel_flow ?? null,
        damperLR: v.Damper_Left_Rear ?? null,
        damperRR: v.Damper_Right_Rear ?? null,
        bspd: v.BSPD ?? null,
        damperLF: v.Damper_Left_Front ?? null,
        damperRF: v.Damper_Right_Front ?? null,
        steering: v.Steering_Angle ?? null,
        accelerationX: v.Acceleration_on_X_axis ?? null,
        accelerationY: v.Acceleration_on_Y_axis ?? null,
        accelerationZ: v.Acceleration_on_Z_axis ?? null,
        
      };
      
      // update prev for single-value charts
      prev.current = {
        rpm: mapped.rpm ?? prev.current.rpm,
        GPS_Speed: mapped.GPS_Speed ?? prev.current.GPS_Speed,
        brakePressure: mapped.brakePressure ?? prev.current.brakePressure,
      };

      // latestTelemetry (if you use it elsewhere)
      setLatestTelemetry((old) => ({ ...old, ...mapped }));

      // multiline chart data
      // …inside handleTelemetryUpdate, after you compute `mapped` and `newTime`…

// engine‐only chart
setLineDataEngine(old => {
  const next = { ...old };
  next.timestamps = [...old.timestamps, newTime].slice(-MAX_DATA_POINTS);
  for (let key of ENGINE_SIGNALS) {
    const val = mapped[key];
    next[key] = [
      ...old[key],
      val != null ? val : (old[key].slice(-1)[0] ?? null)
    ].slice(-MAX_DATA_POINTS);
  }
  return next;
});

setLineDataGPS(old => {
  const next = { ...old };
  next.timestamps = [...old.timestamps, newTime].slice(-MAX_DATA_POINTS);
  for (let key of GPS_SIGNALS) {
    const val = mapped[key];
    next[key] = [
      ...old[key],
      val != null ? val : (old[key].slice(-1)[0] ?? null)
    ].slice(-MAX_DATA_POINTS);
  }
  return next;
});

// vital‐only chart
setLineDataVital(old => {
  const next = { ...old };
  next.timestamps = [...old.timestamps, newTime].slice(-MAX_DATA_POINTS);
  for (let key of VITAL_SIGNALS) {
    const val = mapped[key];
    next[key] = [
      ...old[key],
      val != null ? val : (old[key].slice(-1)[0] ?? null)
    ].slice(-MAX_DATA_POINTS);
  }
  return next;
});

      // map path data
      const { GPS_Longitude: lon, GPS_Latitude: lat, GPS_Speed: speed } = mapped;
      if (typeof lon === "number" && typeof lat === "number") {
        if (
          !lastValidMapPoint.current ||
          lastValidMapPoint.current[0] !== lon ||
          lastValidMapPoint.current[1] !== lat
        ) {
          lastValidMapPoint.current = [lon, lat, speed];
          setMapData((old) =>
            [...old, lastValidMapPoint.current].slice(-MAX_MAP_POINTS)
          );
        }
      }
    };
//  console.log(mapped.GPS_Latitude,mapped.GPS_Longitudem,mapped.GPS_Speed)

  }, [socket]);

  return (
    <>
      <TopActionBar sessionId={sessionId} />

      <div className="mt-10 overflow-hidden rounded-lg bg-white p-6 shadow">
        <h3 className="text-lg font-medium text-gray-900 text-center mb-4">
          Engine Signals
        </h3>
        <MultiLineChart data={lineDataEngine} />
      </div>
      <div className="mt-10 overflow-hidden rounded-lg bg-white p-6 shadow">
        <h3 className="text-lg font-medium text-gray-900 text-center mb-4">
          Live Telemetry Analysis
        </h3>
        <MultiLineChart data={lineDataVital} />
      </div>
      <div className="mt-10 overflow-hidden rounded-lg bg-white p-6 shadow">
        <h3 className="text-lg font-medium text-gray-900 text-center mb-4">
          Live Map
        </h3>
        <MapChart geoData={trackData.coordinates} data={mapData} gates={gates}  height={400} />
      </div>  
      
      <div className="mt-5 space-y-5">
        <dl className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          
          <div className="bg-white p-4 shadow rounded-lg flex justify-center">
            <RPMChart data={prev.current.rpm} height={300} width={300} />
          </div>
          <div className="bg-white p-4 shadow rounded-lg flex justify-center">
            <SpeedChart data={prev.current.GPS_Speed} height={300} width={300} />
          </div>
          <div className="bg-white p-4 shadow rounded-lg flex flex-col items-center justify-center">
            <dt className="text-sm font-medium text-gray-500 text-center">
              Brake Pressure
            </dt>
            <BrakePressureChart
              data={prev.current.brakePressure}
              height={200}
              width={300}
            />
          </div>
        </dl>

        <dl className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          
        </dl>
      </div>
    </>
  );
}
