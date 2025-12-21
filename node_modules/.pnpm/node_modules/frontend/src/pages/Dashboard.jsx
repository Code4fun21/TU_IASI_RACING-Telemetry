// Dashboard.jsx
import { useContext, useEffect, useState, useMemo } from "react";
import { useLocation } from "react-router-dom";
import { DriverContext } from "../context/DriverContext";
import { getTrackById } from "../api/tracks.routes";
import { alignToSharedTime } from "../components/alignSeries";
import { api } from "../services/api";

import LapTimesPanel from"../pages/MQTT/MoreCharts/Charts/LapTimesPanel";
import TimestampSelect from "./MQTT/Components/TimestampSelect";
import VitalChart from "./MQTT/MoreCharts/Charts/VitalChart";
import MultiLineChart from "../components/MultiLineChart";
import MapChart from "../components/MapChart";
import VitalChart_distance from "./MQTT/MoreCharts/Charts/VitalChart_distance";
import AutoPairChart from "../pages/MQTT/MoreCharts/Charts/AutoPairChart";





export default function Dashboard() {
const { driverData, setDriverData } = useContext(DriverContext);
  const { state } = useLocation();
  const { fileData = {}, session } = state || {};

  const [selectedTs, setSelectedTs] = useState(null);
  const [selectedLap, setSelectedLap] = useState(null);

  const [geoData, setGeoData] = useState(null);
  const [gatesData, setGatesData] = useState([]);

  // Helper to read blobs
  const readBlobAsText = (blob) => {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsText(blob);
      });
  };

  // Load driver details for the selected timestamp
  useEffect(() => {
    if (!selectedTs?.driverId) return;
    api.getDriverById(selectedTs.driverId)
      .then((res) => setDriverData(res.data))
      .catch(console.error);
  }, [selectedTs, setDriverData]);

  // Load track + gates JSON
  useEffect(() => {
    if (!session?.trackId) return;

    const fetchTrackFiles = async () => {
      try {
        const track = await api.getTrackById(session.trackId);
        
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

        // --- Corrected assignment ---
        setGeoData(parsedLayout);  // Layout goes to geoData
        setGatesData(parsedGates); // Gates array goes to gatesData

      } catch (err) {
        console.error("Error loading track/gates:", err);
        setGeoData(null);
        setGatesData([]);
      }
    };

    fetchTrackFiles();
  }, [session]);

  

  // ---------- Prepare telemetry series (THE FIX) ----------
  const allSeries = useMemo(() => {
    // 1. Safety Check: If fileData is missing or empty, return empty structure
    if (!fileData || !Array.isArray(fileData)) return {};

    // 2. Map of "Chart Key" -> "Decoder Key"
    // The keys on the Left are what your charts use.
    // The keys on the Right are what your CANDecoder produces.
    const keyMap = {
        "ECU_time": "timestamp",
        "RPM": "rpm",
        "Manifold_air_pressure": "manifoldAirPressure",
        "Manifold_air_temperature": "manifoldAirTemp",
        "Coolant_temperature": "coolantTemp",
        "Main_pulsewidth_bank1": "mainPulseWidth1", // Ensure decoder produces this if needed
        "Main_pulsewidth_bank2": "mainPulseWidth2",
        "Throttle_position": "throttlePosition",
        "Battery_voltage": "batteryVoltage",
        "Air_density_correction": "airDensityCorrection",
        "Warmup_correction": "warmupCorrection",
        "TPS_based_acceleration": "tpsBasedAcceleration",
        "TPS_based_fuel_cut": "tpsBasedFuelCut",
        "Total_fuel_correction": "totalFuelCorrection",
        "VE_value_table_bank1": "veBank1",
        "VE_value_table_bank2": "veBank2",
        "Cold_advance": "coldAdvance",
        "Rate_of_change_of_TPS": "tpsRateChange",
        "Rate_of_change_of_RPM": "rpmRateChange",
        "Sync_loss_counter": "syncLossCounter",
        "Sync_loss_reason_code": "syncLossReason",
        "Average_fuel_flow": "fuelFlow",
        "Damper_Left_Rear": "damperLR",
        "Damper_Right_Rear": "damperRR",
        "Gear": "gear",
        "Brake_Pressure": "brakePressure",
        "BSPD": "bspd",
        "Damper_Left_Front": "damperLF",
        "Damper_Right_Front": "damperRF",
        "Steering_Angle": "steering",
        "Acceleration_on_X_axis": "accelerationX",
        "Acceleration_on_Y_axis": "accelerationY",
        "Acceleration_on_Z_axis": "accelerationZ",
        "Gyroscope_on_X_axis": "gyroX",
        "Gyroscope_on_Y_axis": "gyroY",
        "Gyroscope_on_Z_axis": "gyroZ",
        "GPS_Latitude": "GPS_Latitude",
        "GPS_Longitude": "GPS_Longitude",
        "GPS_Speed": "GPS_Speed"
    };

    // 3. Helper to extract column data from the row array
    const extract = (targetKey) => {
      const sourceKey = keyMap[targetKey] || targetKey;
      
      return fileData.map(row => {
        // Timestamp handling
        const ts = Number(row.timestamp);
        
        // Handle values: Check if exists, else null
        let val = null;
        if (targetKey === "ECU_time") {
            val = ts; // Map timestamp to value for ECU_time series
        } else if (sourceKey in row) {
            val = Number(row[sourceKey]);
        }
        
        return [ts, val];
      });
    };

    // 4. Construct the Output Object (Same structure as your old code)
    const out = {};
    Object.keys(keyMap).forEach(key => {
        out[key] = extract(key);
    });

    // Pass through lap data if it exists in fileData
    out.Gates_times = fileData.Gates_times || { timestamps: [], lap_data: [] };
    
    return out;
  }, [fileData]);


  // Gates filtering (Dependent on allSeries)
  const gatesArray = useMemo(() => {
    const { timestamps = [], lap_data = [] } = allSeries.Gates_times || {};
    if (selectedTs) {
      const startTs = new Date(selectedTs.startTime).getTime() / 1000;
      const endTs   = new Date(selectedTs.endTime)  .getTime() / 1000;
      return timestamps.map((ts, i) => ({
        start: lap_data[i]?.S0 ?? ts,
        end:   lap_data[i]?.ts ?? ts,
        label: lap_data[i]?.lap ?? `Lap ${i + 1}`,
      })).filter(l => l.start >= startTs && l.end <= endTs);
    }
    return timestamps.map((ts, i) => ({
      start: lap_data[i]?.S0 ?? ts,
      end:   lap_data[i]?.ts ?? ts,
      label: lap_data[i]?.lap ?? `Lap ${i + 1}`,
    }));
  }, [allSeries, selectedTs]);

  const [startSec, endSec] = useMemo(() => {
    if (selectedLap != null && gatesArray[selectedLap]) {
      return [gatesArray[selectedLap].start, gatesArray[selectedLap].end];
    }
    if (selectedTs) {
      return [
        new Date(selectedTs.startTime).getTime() / 1000,
        new Date(selectedTs.endTime).getTime() / 1000,
      ];
    }
    return [null, null];
  }, [selectedLap, selectedTs, gatesArray]);

  const filtered = useMemo(() => {
    if (startSec == null || endSec == null) return allSeries;

    return Object.fromEntries(
      Object.entries(allSeries).map(([key, series]) => [
        key,
        key === "Gates_times"
          ? series
          : series.filter(([ts]) => ts >= startSec && ts <= endSec),
      ])
    );
  }, [allSeries, startSec, endSec]);

  const mapData = useMemo(() => {
    const L = filtered.GPS_Latitude || [];
    const O = filtered.GPS_Longitude || [];
    const S = filtered.GPS_Speed || []; 
    return L.map(([, lat], i) => [
      O[i]?.[1] ?? 0,
      lat,
      S[i]?.[1] ?? 0,     // speed
      S[i]?.[0],          // timestamp
    ]);
  }, [filtered]);


  const timeStamps = (arr) => arr ? arr.map(([ts]) => ts * 1000) : [];
  const makeSeries = (arr, name, unit) => ({ name, data: arr ? arr.map(([, v]) => v) : [], unit });

  // Distance charts
  const haversine = (lat1, lon1, lat2, lon2) => {
    const toRad = (deg) => (deg * Math.PI) / 180;
    const R = 6371;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
  };

  const speedVsDistance = useMemo(() => {
    // console.log("Data from backend", filtered)
    if (selectedLap == null || !filtered.GPS_Latitude) return { dist: [], speed: [] };
    
    const coords = filtered.GPS_Latitude.map(([, lat], i) => ({
      lat,
      lon: filtered.GPS_Longitude[i]?.[1] ?? 0,
      speed: filtered.GPS_Speed[i]?.[1] ?? 0,
    }));
    const dist = [0];
    for (let i = 1; i < coords.length; i++) {
      const prev = coords[i - 1];
      const cur  = coords[i];
      const dKm  = haversine(prev.lat, prev.lon, cur.lat, cur.lon);
      dist.push(dist[i - 1] + dKm);
    }
    return { dist, speed: coords.map((pt) => pt.speed) };
  }, [filtered, selectedLap]);


  // helpers (put once, e.g. top of Dashboard.jsx)
  const toPairsMsSorted = (arr = []) =>
    arr
      .filter(([ts, v]) => Number.isFinite(ts) && v != null)
      .sort((a, b) => a[0] - b[0])
      .map(([ts, v]) => [ts * 1000, Number(v)]);

  const makeSeriesPairs = (arr, name, unit) => ({
    name, unit, data: toPairsMsSorted(arr),
  });
  //build the aligned times series
  const toMsArr = (arr) => arr ? arr.map((t) => (t > 2e10 ? Number(t) : Number(t) * 1000)) : [];

  // seconds→ms normalizer (handles numbers or strings)
  const toMs = (t) => {
    const n = Number(t);
    if (!Number.isFinite(n)) return NaN;
    return n < 2e10 ? n * 1000 : n; // treat small epoch values as seconds
  };
  const normalizePairs = (pairs = []) =>
    pairs
      .map(([t, v]) => [toMs(t), Number(v)])
      .filter(([t, v]) => Number.isFinite(t) && Number.isFinite(v));

  // [Label, filteredKey, unit]
  const SIGNAL_SPECS = [
    ["Seconds ECU on",           "ECU_time",                  "s"],
    ["Main pulsewidth bank 1",   "Main_pulsewidth_bank1",     "ms"],
    ["Main pulsewidth bank 2",   "Main_pulsewidth_bank2",     "ms"],
    ["Engine RPM",               "RPM",                       "RPM"],
    ["AFR Target 1",             "AFR_Target1",               "AFR"],
    ["AFR Target 2",             "AFR_Target2",               "AFR"],
    ["Manifold air pressure",    "Manifold_air_pressure",     "kPa"],
    ["Manifold air temperature", "Manifold_air_temperature",  "°C"], 
    ["Coolant temperature",      "Coolant_temperature",       "°C"], 
    ["Throttle",                 "Throttle_position",         "%"],
    ["Battery voltage",          "Battery_voltage",           "V"],
    ["Air density correction",   "Air_density_correction",    "%"],
    ["Warmup correction",        "Warmup_correction",         "%"],
    ["TPS-based acceleration",   "TPS_based_acceleration",    "%/s"],
    ["TPS-based fuel cut",       "TPS_based_fuel_cut",        "%"],
    ["Total fuel correction",    "Total_fuel_correction",     "%"],
    ["VE value table/bank 1",    "VE_value_table_bank1",      "%"],
    ["VE value table/bank 2",    "VE_value_table_bank2",      "%"],
    ["Cold advance",             "Cold_advance",              "deg"],
    ["Sync-loss counter",        "Sync_loss_counter",         ""],
    ["Sync-loss reason code",    "Sync_loss_reason_code",     ""],
    ["Average fuel flow",        "Average_fuel_flow",         "cc/min"],
    ["GPS Latitude",             "GPS_Latitude",              "°"],
    ["GPS Longitude",            "GPS_Longitude",             "°"],
    ["GPS Speed",                "GPS_Speed",                 "km/h"],
    ["Roll",                     "Roll",                      "°"],
    ["Pitch",                    "Pitch",                     "°"],
    ["Yaw",                      "Yaw",                       "°"],
    ["Damper4",                  "Damper4",                   "mV"],
    ["Acceleration XYZ",         "Acceleration_XYZ",          "m/s²"],
    ["Gyro XYZ",                 "Gyro_XYZ",                  "°/s"],
  ];

  // Build a dropdown catalog from `filtered`
  const buildSignalsCatalog = (filtered) => {
    const out = {};
    for (const [label, key, unit] of SIGNAL_SPECS) {
      const pairs = filtered?.[key];
      if (Array.isArray(pairs) && pairs.length) {
        out[label] = { unit, pairs: normalizePairs(pairs) };
      }
    }
    return out;
  };

  const signalsCatalog = useMemo(() => buildSignalsCatalog(filtered), [filtered]);

  // Picker state
  const [staged, setStaged] = useState([]);     
  const [pick, setPick] = useState("");         
  const [committed, setCommitted] = useState([]); 

  const MAX_SIGNALS = 5;
  const available = Object.keys(signalsCatalog).filter(k => !staged.includes(k));

  const addPicked   = () => { if (pick && staged.length < MAX_SIGNALS) setStaged(prev => [...prev, pick]); setPick(""); };
  const removeStaged = (key) => setStaged(prev => prev.filter(k => k !== key));
  const createChart  = () => setCommitted(staged);
  const clearChart   = () => setCommitted([]);



  
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

      {/* Map — render only after geoData is loaded */}

      <div className="flex gap-4 items-start">
        <div className="grow">
          {geoData && (
            <MapChart
              geoData={geoData}
              data={mapData}
              gates={gatesData}
              width={900}
              height={400}
              // rotation={270}
            />
          )}
        </div>

      {/* Lap times to the right of the map */}
      <LapTimesPanel
        laps={filtered?.Gates_times?.lap_data || []}
        title="Lap Times"
      />
    </div>


      {/* GPS Vitals */}
      {/* <div className="rounded-lg bg-white p-4 shadow">
        <VitalChart
          dateTime={timeStamps(filtered.GPS_Latitude)}
          series={[
            makeSeries(filtered.GPS_Latitude,  "Latitude",  "°"),
            makeSeries(filtered.GPS_Longitude, "Longitude", "°"),
            makeSeries(filtered.GPS_Speed,     "Speed",     "km/h"),
          ]}
          height={300}
        /> 
      </div>*/}

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
        title={staged.length >= MAX_SIGNALS ? `Max ${MAX_SIGNALS} signals` : "Add"}
      >
        Add
      </button>

      <div className="mx-2 h-5 w-px bg-gray-300" />

      <button
        className="rounded bg-emerald-600 text-white text-sm px-3 py-1 disabled:opacity-50"
        onClick={createChart}
        disabled={!staged.length}
        title="Render chart with selected signals"
      >
        Create chart
      </button>

      <button
        className="rounded border border-gray-300 text-gray-700 text-sm px-3 py-1 disabled:opacity-50"
        onClick={clearChart}
        disabled={!committed.length}
        title="Hide chart"
      >
        Clear
      </button>

      <span className="text-xs text-gray-500 tabular-nums">{staged.length}/{MAX_SIGNALS}</span>
    </div>
  </div>

  {/* chips for staged (pre-commit) */}
  <div className="mb-3 flex flex-wrap gap-2">
    {staged.map((k) => (
      <span key={k} className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-1 text-xs text-gray-700">
        {k}
        <button
          className="ml-1 rounded px-1 text-gray-500 hover:text-gray-800"
          onClick={() => removeStaged(k)}
          aria-label={`Remove ${k}`}
          title="Remove"
        >
          ×
        </button>
      </span>
    ))}
    {!staged.length && (
      <span className="text-xs text-gray-400">Pick up to {MAX_SIGNALS} signals, then press “Create chart”.</span>
    )}
  </div>

  {/* Render your EXISTING AutoPairChart only after "Create chart" */}
  {!!committed.length && (
    <AutoPairChart
      align="base-fastest"
      alignMethod="linear"
      toleranceMs={1000}
      series={committed.map((label) => ({
        name: label,
        unit: signalsCatalog[label].unit,
        pairs: signalsCatalog[label].pairs, // already normalized to ms
      }))}
      height={320}
    />
  )}
</div>


      {/* Engine & RPM */}
      {/* <div className="rounded-lg bg-white p-4 shadow">
        <VitalChart
          dateTime={timeStamps(filtered.ECU_time)}
          series={[
            makeSeries(filtered.Main_pulsewidth_bank1, "Main PW1", "ms"),
            makeSeries(filtered.Main_pulsewidth_bank2, "Main PW2", "ms"),
            makeSeries(filtered.RPM,                   "RPM",      "rpm"),
          ]}
          height={300}
        />
      </div> */}

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
          series={[{ name: "Speed",    data: filtered.GPS_Speed.map(([,v]) => v),         unit: "km/h" }]}
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
      time: toMsArr(timeStamps(filtered.Coolant_temperature)),   // <-- convert to ms
      data: filtered.Coolant_temperature.map(([, v]) => v),
    },
  ]}
  height={300}
/>

      </div>

      {/* Engine RPM vs Time */}
      {/* <div className="rounded-lg bg-white p-4 shadow">
        <h3 className="font-medium text-gray-700 mb-2">Engine RPM vs Time</h3>
        <VitalChart
          dateTime={timeStamps(filtered.ECU_time)}
          series={[{ name: "RPM", data: filtered.RPM.map(([,v]) => v), unit: "rpm" }]}
          height={300}
        />
      </div> */}

      {/* 5f2 */}
      {/* <div className="rounded-lg bg-white p-4 shadow">
        <h3 className="font-medium text-gray-700 mb-2">5f2</h3>
        <VitalChart
          dateTime={timeStamps(filtered.Manifold_air_pressure)}
          series={[
            makeSeries(filtered.Manifold_air_pressure,    "MAP",         "kPa"),
            makeSeries(filtered.Manifold_air_temperature, "MAT",         "°C"),
            makeSeries(filtered.Coolant_temperature,      "Coolant Temp","°C"),
          ]}
          height={300}
        />
      </div> */}

      {/* 5f3 */}
      {/* <div className="rounded-lg bg-white p-4 shadow">
        <h3 className="font-medium text-gray-700 mb-2">5f3</h3>
        <VitalChart
          dateTime={timeStamps(filtered.Throttle_position)}
          series={[
            makeSeries(filtered.Throttle_position, "TPS",       "%"),
            makeSeries(filtered.Battery_voltage,   "Batt volt", "V"),
          ]}
          height={300}
        />
      </div> */}

      

      {/* 5f5 */}
      {/* <div className="rounded-lg bg-white p-4 shadow">
        <h3 className="font-medium text-gray-700 mb-2">5f5</h3>
        <VitalChart
          dateTime={timeStamps(filtered.Warmup_correction)}
          series={[
            makeSeries(filtered.Warmup_correction,      "Warmup correction",       "%"),
            makeSeries(filtered.TPS_based_acceleration, "TPS based acceleration",  "%"),
            makeSeries(filtered.TPS_based_fuel_cut,     "TPS based fuel cut",      "%"),
          ]}
          height={300}
        />
      </div> */}

      {/* 5f6 */}
      {/* <div className="rounded-lg bg-white p-4 shadow">
        <h3 className="font-medium text-gray-700 mb-2">5f6</h3>
        <VitalChart
          dateTime={timeStamps(filtered.Total_fuel_correction)}
          series={[
            makeSeries(filtered.Total_fuel_correction, "Total_fuel_correction", "%"),
            makeSeries(filtered.VE_value_table_bank1,  "VE value table bank1",  "%"),
            makeSeries(filtered.VE_value_table_bank2,  "VE value table bank2",  "%"),
          ]}
          height={300}
        />
      </div> */}

      {/* 5f7 */}
      {/* <div className="rounded-lg bg-white p-4 shadow">
        <h3 className="font-medium text-gray-700 mb-2">5f7</h3>
        <VitalChart
          dateTime={timeStamps(filtered.Cold_advance)}
          series={[
            makeSeries(filtered.Cold_advance,           "Cold advance",           "°"),
            makeSeries(filtered.Rate_of_change_of_TPS,  "Rate of change of TPS",  "%/s"),
            makeSeries(filtered.Rate_of_change_of_RPM,  "Rate of change of RPM",  "RPM/%"),
          ]}
          height={300}
        />
      </div> */}

      {/* 61B */}
      {/* <div className="rounded-lg bg-white p-4 shadow">
        <h3 className="font-medium text-gray-700 mb-2">61B</h3>
        <VitalChart
          dateTime={timeStamps(filtered.Sync_loss_counter)}
          series={[
            makeSeries(filtered.Sync_loss_counter,     "Sync loss counter",    " "),
            makeSeries(filtered.Sync_loss_reason_code, "Sync loss reason code"," "),
          ]}
          height={300}
        />
      </div> */}

      {/* 624 */}
      {/* <div className="rounded-lg bg-white p-4 shadow">
        <h3 className="font-medium text-gray-700 mb-2">624</h3>
        <VitalChart
          dateTime={timeStamps(filtered.Average_fuel_flow)}
          series={[
            makeSeries(filtered.Average_fuel_flow, "Average fuel flow", "cc/min"),
          ]}
          height={300}
        />
      </div> */}

      {/* 115 (gear/brake/BSPD) */}
      {/* <div className="rounded-lg bg-white p-4 shadow">
        <h3 className="font-medium text-gray-700 mb-2">115</h3>
        <VitalChart
          dateTime={timeStamps(filtered.Cold_advance)}
          series={[
            makeSeries(filtered.Gear,           "Gear",           " "),
            makeSeries(filtered.Brake_Pressure, "Brake Pressure", "mV"),
            makeSeries(filtered.BSPD,           "BSPD",           " "),
          ]}
          height={300}
        />
      </div> */}



      {/* 118 (Accel XYZ) */}
      <div className="rounded-lg bg-white p-4 shadow">
        <h3 className="font-medium text-gray-700 mb-2">118</h3>
        <VitalChart
          dateTime={timeStamps(filtered.Acceleration_on_X_axis)}
          series={[
            makeSeries(filtered.Acceleration_on_X_axis, "Acceleration X", "m/s^2"),
            makeSeries(filtered.Acceleration_on_Y_axis, "Acceleration Y", "m/s^2"),
            makeSeries(filtered.Acceleration_on_Z_axis, "Acceleration Z", "m/s^2"),
          ]}
          height={300}
        />
      </div>

      {/* 119 (Gyro XYZ) */}
      <div className="rounded-lg bg-white p-4 shadow">
        <h3 className="font-medium text-gray-700 mb-2">119</h3>
        <VitalChart
          dateTime={timeStamps(filtered.Gyroscope_on_X_axis)}
          series={[
            makeSeries(filtered.Gyroscope_on_X_axis, "Gyro X", "rad/s"),
            makeSeries(filtered.Gyroscope_on_Y_axis, "Gyro Y", "rad/s"),
            makeSeries(filtered.Gyroscope_on_Z_axis, "Gyro Z", "rad/s"),
          ]}
          height={300}
        />
      </div>
    </div>
  );
}
