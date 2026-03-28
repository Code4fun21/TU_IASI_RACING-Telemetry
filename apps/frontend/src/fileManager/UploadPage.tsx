import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import Papa from 'papaparse';
import { api } from '../services/api'; 
import RaceTrackSelect from "../pages/MQTT/Components/RaceTrackSelect";
import MapChartEditable from '../components/MapChartEditable';
import * as turf from '@turf/turf';
import { TbArrowsRightLeft } from "react-icons/tb";
import { processTrackGeometry,getSectorIndices } from '../services/gateIdentifier';

interface Gate {
  name: string;
  lat1: number;
  lon1: number;
  lat2: number;
  lon2: number;
  isPreview?: boolean; 
  color?: string;
}

interface NewGateForm {
  name: string;
  lat1: string; 
  lon1: string;
  lat2: string;
  lon2: string;
}

interface Coordinate {
  lat: number;
  lon: number;
}

interface TrackData {
  id: number | string;
  name?: string;
}

interface SessionMeta {
  csvFileName: string;
  decodedFileName: string;
  trackId: number;
  date: string;
  time: string;
  driverId: number;
  monopostId: number;
}

interface ApexPoint {
  index: number;
  coordinate: number[];
  totalCornerAngle: number;
  isRich: boolean; // True if it was a group of points, False if it was a single sharp point
}

export default function UploadPage() {
  const navigate = useNavigate();
  
  const [activeTab, setActiveTab] = useState<'session' | 'track'>('session');
  const [uploading, setUploading] = useState<boolean>(false);
  const [sessionFile, setSessionFile] = useState<File | null>(null);
  const [plotData, setPlotData] = useState<any[]>([]);
  const [trackId, setTrackId] = useState<string>("1"); 
  const [trackName, setTrackName] = useState<string>("");
  const [layoutFile, setLayoutFile] = useState<File | null>(null);
  const [gatesFile, setGatesFile] = useState<File | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [existingTracks, setExistingTracks] = useState<any[]>([]); 
  const [previewLayout, setPreviewLayout] = useState<any>(null);
  const [previewGates, setPreviewGates] = useState<Gate[]>([]);
  const [selectedTrackId, setSelectedTrackId] = useState<number | null>(null);
  const [newGate, setNewGate] = useState<NewGateForm>({ name: "", lat1: "", lon1: "", lat2: "", lon2: "" });

  const [wizardActive, setWizardActive] = useState(false);
  const [detectedTurns, setDetectedTurns] = useState<any[]>([]);
  const [currentTurnIdx, setCurrentTurnIdx] = useState(0);
  const [isClockwise, setIsClockwise] = useState(true);
  const [currentTurnName, setCurrentTurnName] = useState<string>("");
  const [gateStart, setGateStart] = useState<Coordinate | null>(null);

  const createPerpendicularGate = (coord: any[], nextCoord:any[], name: string): Gate => {
    // Turf strictly expects [longitude, latitude]
    const bearing = turf.bearing(coord, nextCoord);
    
    // We calculate perpendicular angles
    const perpBearing = bearing + 90;
    
    // CHANGED: 0.006 km = 6 meters from the center line (12 meters total gate width)
    // This perfectly matches the coordinate spread in your screenshot!
    const distance = 0.006; 
    
    const point1 = turf.destination(coord, distance, perpBearing, {units: 'kilometers'});
    const point2 = turf.destination(coord, distance, perpBearing + 180, {units: 'kilometers'});

    return {
      name,
      lat1: point1.geometry.coordinates[1], // Latitude is index 1
      lon1: point1.geometry.coordinates[0], // Longitude is index 0
      lat2: point2.geometry.coordinates[1],
      lon2: point2.geometry.coordinates[0],
      isPreview: false,
      
    };
  };


// const generateFSKinematicGates = () => {
//   console.log("--- FS Scale Kinematic Chaining & Classification ---");
//   if (!previewLayout || !previewLayout.features || previewLayout.features.length < 2) return;

//   setPreviewGates([]);

//   let leftRaw: number[][] = previewLayout.features[0].geometry.coordinates;
//   if (previewLayout.features[0].geometry.type === "Polygon") leftRaw = (leftRaw as any)[0];
//   const isClosed = leftRaw[0][0] === leftRaw[leftRaw.length - 1][0] && leftRaw[0][1] === leftRaw[leftRaw.length - 1][1];
//   const leftCoords = isClosed ? leftRaw.slice(0, -1) : leftRaw;
//   const N = leftCoords.length;

//   const WINDOW_METERS = 20;
//   const ENERGY_THRESHOLD = 15;
//   const FS_CHAIN_GAP_METERS = 6; // FS Rule: Slalom cones are 7-12m apart

//   // ==========================================
//   // STAGE 1 & 2: Kinematic Energy Baseline
//   // ==========================================
//   const headings = leftCoords.map((p, i) => {
//     const pNext = leftCoords[(i + 1) % N];
//     const x1 = p[0] * (Math.PI / 180) * 6378137;
//     const y1 = Math.log(Math.tan((90 + p[1]) * Math.PI / 360)) * 6378137;
//     const x2 = pNext[0] * (Math.PI / 180) * 6378137;
//     const y2 = Math.log(Math.tan((90 + pNext[1]) * Math.PI / 360)) * 6378137;
//     return Math.atan2(y2 - y1, x2 - x1) * (180 / Math.PI);
//   });

//   const deltaThetas: number[] = [];
//   const segLens: number[] = [];

//   for (let i = 0; i < N; i++) {
//     const thetaCurr = headings[i];
//     const thetaPrev = headings[(i - 1 + N) % N];
//     let delta = ((thetaCurr - thetaPrev + 180) % 360);
//     if (delta < 0) delta += 360; 
//     delta -= 180;
    
//     deltaThetas.push(delta);
//     segLens.push(turf.distance(turf.point(leftCoords[i]), turf.point(leftCoords[(i + 1) % N]), { units: 'meters' }));
//   }

//   const accumulatedYaws = leftCoords.map((_, i) => {
//     let sumYaw = 0;
//     let distAcc = 0;
//     let k = i;
//     while (distAcc < WINDOW_METERS) {
//       sumYaw += deltaThetas[k];
//       distAcc += segLens[k];
//       k = (k + 1) % N;
//       if (k === i) break;
//     }
//     return sumYaw;
//   });

//   // ==========================================
//   // STAGE 3: Action Zones (Base Events)
//   // ==========================================
//   const isActiveZone = accumulatedYaws.map(yaw => Math.abs(yaw) > ENERGY_THRESHOLD);
//   const startScanIdx = isActiveZone.indexOf(false);
//   if (startScanIdx === -1) return console.warn("Track energy too high.");

//   const rawEvents: any[] = [];
//   let currentZone: number[] = [];
//   let inZone = false;

//   for (let i = 0; i < N; i++) {
//     let idx = (startScanIdx + i) % N;
//     if (isActiveZone[idx]) {
//       if (!inZone) inZone = true;
//       currentZone.push(idx);
//     } else {
//       if (inZone) {
//         // Calculate the core properties of this single event
//         const netAngle = Math.abs(currentZone.reduce((sum, idx) => sum + deltaThetas[idx], 0));
//         const yawSum = currentZone.reduce((sum, idx) => sum + accumulatedYaws[idx], 0);
        
//         rawEvents.push({
//           entryIdx: currentZone[0],
//           exitIdx: currentZone[currentZone.length - 1],
//           netAngle,
//           sign: Math.sign(yawSum)
//         });
        
//         currentZone = [];
//         inZone = false;
//       }
//     }
//   }
//   if (inZone && currentZone.length > 0) {
//     rawEvents.push({
//       entryIdx: currentZone[0],
//       exitIdx: currentZone[currentZone.length - 1],
//       netAngle: Math.abs(currentZone.reduce((sum, idx) => sum + deltaThetas[idx], 0)),
//       sign: Math.sign(currentZone.reduce((sum, idx) => sum + accumulatedYaws[idx], 0))
//     });
//   }

//   // ==========================================
//   // FS STEP 1: The Proximity Chain (6m Rule)
//   // ==========================================
//   if (rawEvents.length === 0) return;
//   const chains: typeof rawEvents[] = [];
//   let currentChain = [rawEvents[0]];

//   for (let i = 1; i < rawEvents.length; i++) {
//     const prevEvent = currentChain[currentChain.length - 1];
//     const currEvent = rawEvents[i];

//     // Measure path gap from OUT of previous to IN of current
//     let gapDist = 0;
//     let walkIdx = prevEvent.exitIdx;
//     while (walkIdx !== currEvent.entryIdx && gapDist <= FS_CHAIN_GAP_METERS) {
//       gapDist += segLens[walkIdx];
//       walkIdx = (walkIdx + 1) % N;
//     }

//     if (gapDist <= FS_CHAIN_GAP_METERS) {
//       currentChain.push(currEvent); // Chain them!
//     } else {
//       chains.push(currentChain);    // Break the chain
//       currentChain = [currEvent];
//     }
//   }
//   chains.push(currentChain);

//   // ==========================================
//   // FS STEPS 2, 3 & 4: Filter, Name, and Extract
//   // ==========================================
//   const finalGates: Gate[] = [];
//   let maneuverCount = 1;

//   chains.forEach((chain) => {
//     // FS STEP 4: The Slalom Filter (Garbage Collection)
//     // If it's isolated (not a slalom/chicane) and the net steering angle is weak, destroy it.
//     if (chain.length === 1 && chain[0].netAngle < 15) return;

//     // FS STEP 2: The FS Dictionary
//     let typeName = "Turn";
    
//     if (chain.length > 1) {
//       let signChanges = 0;
//       let currentSign = chain[0].sign;
      
//       for (let i = 1; i < chain.length; i++) {
//         if (chain[i].sign !== currentSign && chain[i].sign !== 0) {
//           signChanges++;
//           currentSign = chain[i].sign;
//         }
//       }

//       if (signChanges === 0) typeName = "Double Apex";
//       else if (signChanges === 1) typeName = "Chicane";
//       else typeName = "Slalom";
//     }

//     const maneuverName = `${typeName} ${maneuverCount++}`;

//     // FS STEP 3: Final Extraction
//     // Use the IN gate of the very first event, and the OUT gate of the very last.
//     const masterEntryIdx = chain[0].entryIdx;
//     const masterExitIdx = chain[chain.length - 1].exitIdx;

//     const gIn = createPerpendicularGate(leftCoords[masterEntryIdx], leftCoords[(masterEntryIdx + 1) % N], `${maneuverName} IN`);
//     const gOut = createPerpendicularGate(leftCoords[masterExitIdx], leftCoords[(masterExitIdx + 1) % N], `${maneuverName} OUT`);
    
//     finalGates.push(gIn, gOut);
//   });

//   setPreviewGates(finalGates);
//   console.log(`FS Chain logic successfully grouped ${finalGates.length / 2} classified track sectors.`);
// };
//   --- EXACT APEX GATE PLACEMENT ---
  
  const confirmTurn = () => {
    if (detectedTurns.length === 0) return;
    const turn = detectedTurns[currentTurnIdx];
    
    let leftRaw: any[] = previewLayout.features[0].geometry.coordinates;
    if (previewLayout.features[0].geometry.type === "Polygon") leftRaw = leftRaw[0];
    const isClosed = leftRaw[0][0] === leftRaw[leftRaw.length - 1][0] && 
                     leftRaw[0][1] === leftRaw[leftRaw.length - 1][1];
    const leftCoords = isClosed ? leftRaw.slice(0, -1) : leftRaw;

    let rightRaw: any[] = previewLayout.features[1].geometry.coordinates;
    if (previewLayout.features[1].geometry.type === "Polygon") rightRaw = rightRaw[0];
    const rightLine = turf.lineString(rightRaw);

    const createGateAtApex = (idx: number, nameSuffix: string): Gate | null => {
        const ptLeft = leftCoords[idx];
        if (!ptLeft) return null;

        // Draw a perfectly straight line to the right wall
        const rightSnap = turf.nearestPointOnLine(rightLine, turf.point(ptLeft));

        return {
            name: `${currentTurnName} ${nameSuffix}`,
            lat1: ptLeft[1],
            lon1: ptLeft[0],
            lat2: rightSnap.geometry.coordinates[1],
            lon2: rightSnap.geometry.coordinates[0],
            isPreview: false,
            color: '#6b7280'
        };
    };

    // Both IN and OUT gates are placed EXACTLY on the same apex index
    const g1 = createGateAtApex(turn.apexIdx, "In");
    const g2 = createGateAtApex(turn.apexIdx, "Out");

    const newGates: Gate[] = [];
    if (g1) newGates.push(g1);
    if (g2) newGates.push(g2);

    setPreviewGates(prev => [...prev, ...newGates]);
    
    if (currentTurnIdx < detectedTurns.length - 1) {
        const nextIdx = currentTurnIdx + 1;
        setCurrentTurnIdx(nextIdx);
        setCurrentTurnName(`Turn ${nextIdx + 1}`);
    } else {
        alert("Wizard complete!");
        setWizardActive(false);
    }
  };

const generateFSKinematicGates = () => {
  if (!previewLayout || !previewLayout.features || previewLayout.features.length < 1) return;

  let leftRaw: number[][] = previewLayout.features[0].geometry.coordinates;
  if (previewLayout.features[0].geometry.type === "Polygon") leftRaw = (leftRaw as any)[0];
  const isClosed = leftRaw[0][0] === leftRaw[leftRaw.length - 1][0] && leftRaw[0][1] === leftRaw[leftRaw.length - 1][1];
  const leftCoords = isClosed ? leftRaw.slice(0, -1) : leftRaw;
  const N = leftCoords.length;

  const zones = processTrackGeometry(previewLayout);
  const sectors=getSectorIndices(previewLayout.features[0].geometry.coordinates,previewLayout.features[1].geometry.coordinates,zones)
  console.log(zones,sectors)
  if (!zones || zones.length === 0) return;

  const finalGates: Gate[] = [];

  zones.forEach((zone: any, index: number) => {
    const maneuverName = `T${index + 1}-${zone.label}`;

    const startIdx = zone.startIndex % N;
    const endIdx = zone.endIndex % N;

    const gIn = createPerpendicularGate(leftCoords[startIdx], leftCoords[(startIdx + 1) % N], `${maneuverName} IN`);
    const gOut = createPerpendicularGate(leftCoords[endIdx], leftCoords[(endIdx + 1) % N], `${maneuverName} OUT`);
    
    finalGates.push(gIn, gOut);
  });

    if (!sectors || sectors.length === 0) return;


  sectors.forEach((sector: any, index: number) => {
    const sector_name=`S${index}`;

    const sectorGate=createPerpendicularGate(leftCoords[sector],leftCoords[(sector + 1) % N],sector_name)

    
    finalGates.push(sectorGate);
  });


  setPreviewGates(finalGates);
};



  const wizardPreviewGates = useMemo(() => {
    if (!wizardActive || detectedTurns.length === 0) return [];
    const turn = detectedTurns[currentTurnIdx];
    if (!turn || !previewLayout?.features || previewLayout.features.length < 2) return [];

    let leftRaw: any[] = previewLayout.features[0].geometry.coordinates;
    if (previewLayout.features[0].geometry.type === "Polygon") leftRaw = leftRaw[0];
    const isClosed = leftRaw[0][0] === leftRaw[leftRaw.length - 1][0] && 
                     leftRaw[0][1] === leftRaw[leftRaw.length - 1][1];
    const leftCoords = isClosed ? leftRaw.slice(0, -1) : leftRaw;

    let rightRaw: any[] = previewLayout.features[1].geometry.coordinates;
    if (previewLayout.features[1].geometry.type === "Polygon") rightRaw = rightRaw[0];
    const rightLine = turf.lineString(rightRaw);

    const createGateAtApex = (idx: number, nameSuffix: string): Gate | null => {
        const ptLeft = leftCoords[idx];
        if (!ptLeft) return null;

        const rightSnap = turf.nearestPointOnLine(rightLine, turf.point(ptLeft));

        return {
            name: `${currentTurnName || `Turn ${currentTurnIdx + 1}`} ${nameSuffix}`,
            lat1: ptLeft[1],
            lon1: ptLeft[0],
            lat2: rightSnap.geometry.coordinates[1],
            lon2: rightSnap.geometry.coordinates[0],
            isPreview: true,
            color: '#3b82f6'
        };
    };

    // Both IN and OUT preview gates are placed EXACTLY on the same apex index
    const g1 = createGateAtApex(turn.apexIdx, "In (Preview)");
    const g2 = createGateAtApex(turn.apexIdx, "Out (Preview)");

    const previewArray: Gate[] = [];
    if (g1) previewArray.push(g1);
    if (g2) previewArray.push(g2);
    
    return previewArray;
  }, [wizardActive, detectedTurns, currentTurnIdx, isClockwise, currentTurnName, previewLayout]);

  const skipTurn = () => {
    moveToNext();
  };

  const moveToNext = () => {
    if (currentTurnIdx < detectedTurns.length - 1) {
      setCurrentTurnIdx(prev => prev + 1);
    } else {
      alert("Wizard complete!");
      setWizardActive(false);
    }
  };

  const onRaceTrackChange = (track: TrackData) => {
    if (track && track.id) {
        setTrackId(String(track.id));
    }
  };

  const handleSessionFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;
    const validExtensions = ['.csv', '.txt'];
    const fileExtension = selectedFile.name.slice(selectedFile.name.lastIndexOf('.')).toLowerCase();
    const isValidType = selectedFile.type === 'text/csv' || selectedFile.type === 'text/plain' || selectedFile.type === 'application/vnd.ms-excel' || validExtensions.includes(fileExtension);

    if (!isValidType) {
        alert("Please upload a valid .csv or .txt file.");
        return;
    }
    setSessionFile(selectedFile);
    Papa.parse(selectedFile, {
      header: true,
      dynamicTyping: true,
      complete: (results) => { setPlotData(results.data); },
      error: (err: Error) => alert("Error parsing file: " + err.message)
    });
  };

  const convertUnixToDate = (unixTimestamp: number) => {
    const timestamp = String(unixTimestamp).length === 10 ? unixTimestamp * 1000 : unixTimestamp;
    const dateObj = new Date(timestamp);
    return {
      date: dateObj.toLocaleDateString('en-CA'),
      time: dateObj.toLocaleTimeString('en-GB', { hour12: false }) 
    };
  };

  const handleSaveSession = async () => {
    if (!sessionFile) return;
    setUploading(true);
    try {
      const storedFileName = await api.uploadFile(sessionFile);
      const dateTime = convertUnixToDate(sessionFile.lastModified);
      const decodedName = storedFileName.replace(/\.(csv|txt)$/i, '') + '_decoded.json';
      const sessionMeta: SessionMeta = { csvFileName: storedFileName, decodedFileName: decodedName, trackId: Number(trackId), date: dateTime.date, time: dateTime.time, driverId: 1, monopostId: 1 };
      await api.saveSession(sessionMeta);
      alert("✅ Session Saved Successfully!");
      navigate('/'); 
    } catch (error) {
      console.error(error);
      alert("❌ Failed to save session.");
    } finally {
      setUploading(false);
    }
  };

  const readJsonFile = (file: File): Promise<any> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const json = JSON.parse(e.target?.result as string);
          resolve(json);
        } catch (err) { reject(new Error("File is not valid JSON")); }
      };
      reader.onerror = (e) => reject(e);
      reader.readAsText(file);
    });
  };

  const handleLayoutFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      setLayoutFile(file);
      try {
          const json = await readJsonFile(file);
          if (json.type !== "FeatureCollection") throw new Error("Invalid GeoJSON FeatureCollection");
          setPreviewLayout(json);
      } catch (err: any) {
          alert("Error parsing layout: " + err.message);
          setPreviewLayout(null);
      }
  };

  const handleGatesFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      setGatesFile(file);
      try {
          const json = await readJsonFile(file);
          if (!Array.isArray(json)) throw new Error("Gates must be an array");
          setPreviewGates(json as Gate[]);
      } catch (err: any) {
          alert("Error parsing gates: " + err.message);
          setPreviewGates([]);
      }
  };

  const handleEditExistingTrack = async (selectedTrackId: number) => {
    try {
        setUploading(true);
        const track = await api.getTrackById(selectedTrackId); 
        if (!track || !track.coordinates || !track.gates) {
            alert("This track configuration is missing required layout or gates files.");
            return;
        }
        setSelectedTrackId(selectedTrackId);
        setTrackName(track.name || "");
        const layoutBlob = await api.downloadFile(track.coordinates);
        const gatesBlob = await api.downloadFile(track.gates);
        setPreviewLayout(JSON.parse(await layoutBlob.text()));
        setPreviewGates(JSON.parse(await gatesBlob.text()));
        setIsEditMode(false); 
    } catch (err: any) { alert("Error loading existing track: " + err.message); } finally { setUploading(false); }
  };

  const openTrackSelector = async () => {
    const tracks = await api.getTracks(); 
    setExistingTracks(tracks);
    setIsEditMode(true);
  };

  const handleAddGate = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    const gate: Gate = {
      name: newGate.name || `G${previewGates.length + 1}`,
      lat1: Number(newGate.lat1),
      lon1: Number(newGate.lon1),
      lat2: Number(newGate.lat2),
      lon2: Number(newGate.lon2),
    };
    if ([gate.lat1, gate.lon1, gate.lat2, gate.lon2].some(n => isNaN(n))) {
      alert("Please provide both points by clicking the map or entering manually.");
      return;
    }
    setPreviewGates([...previewGates, gate]);
    setNewGate({ name: "", lat1: "", lon1: "", lat2: "", lon2: "" });
  };

  const handleClearForm = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    setNewGate({ name: "", lat1: "", lon1: "", lat2: "", lon2: "" });
    setGateStart(null); 
  };

  const handleDeleteGate = (index: number) => {
      const updated = previewGates.filter((_, i) => i !== index);
      setPreviewGates(updated);
  };

  const activeDrawingGate = useMemo(() => {
    if (!newGate.lat1 || !newGate.lon1) return [];
    return [{
      name: "New Point",
      lat1: Number(newGate.lat1),
      lon1: Number(newGate.lon1),
      lat2: newGate.lat2 ? Number(newGate.lat2) : Number(newGate.lat1),
      lon2: newGate.lon2 ? Number(newGate.lon2) : Number(newGate.lon1),
      isPreview: true
    }];
  }, [newGate]);

  const handleMapClick = (coords: Coordinate) => {
    setNewGate((prev) => {
      if (!prev.lat1) {
        return { ...prev, lat1: coords.lat.toString(), lon1: coords.lon.toString() };
      } 
      if (!prev.lat2) {
        return { ...prev, lat2: coords.lat.toString(), lon2: coords.lon.toString() };
      }
      return { ...prev, lat2: coords.lat.toString(), lon2: coords.lon.toString() };
    });
  };

  const handleGateDelete = (index: number) => {
    const updated = previewGates.filter((_, i) => i !== index);
    setPreviewGates(updated);
  };

  const handleSaveTrack = async () => {
    if (!trackName || !previewLayout) {
        alert("Track Name and Layout are required.");
        return;
    }
    setUploading(true);
    try {
        const layoutBlob = new Blob([JSON.stringify(previewLayout)], { type: "application/json" });
        const gatesBlob = new Blob([JSON.stringify(previewGates)], { type: "application/json" });
        const finalLayoutFile = new File([layoutBlob], `${trackName}_layout.json`);
        const finalGatesFile = new File([gatesBlob], `${trackName}_gates.json`);
        const storedLayoutName = await api.uploadFile(finalLayoutFile);
        const storedGatesName = await api.uploadFile(finalGatesFile);

        if (selectedTrackId) {
            await api.updateTrack(selectedTrackId, {
                name: trackName,
                gates: storedGatesName,
                coordinates: storedLayoutName 
            });
            alert("✅ Track Configuration Updated!");
        } else {
            await api.saveTrack({
                name: trackName,
                gates: storedGatesName,
                coordinates: storedLayoutName 
            });
            alert("✅ New Track Saved Successfully!");
        }

        setTrackName("");
        setLayoutFile(null);
        setGatesFile(null);
        setPreviewLayout(null);
        setPreviewGates([]);
        setSelectedTrackId(null); 
        setGateStart(null);
    } catch (error: any) {
        console.error(error);
        alert(`❌ Error: ${error.message}`);
    } finally { setUploading(false); }
  };

  return (
    <div className="flex min-h-screen justify-center bg-gray-900 text-white p-6">
      <div className="max-w-6xl w-full bg-gray-800 rounded-lg shadow-2xl overflow-hidden border border-gray-700 flex flex-col">
        
        {/* Header Tabs */}
        <div className="flex border-b border-gray-700">
          <button
            onClick={() => setActiveTab('session')}
            className={`flex-1 py-4 text-center font-bold text-lg transition-colors ${
              activeTab === 'session' 
                ? 'bg-gray-800 text-red-500 border-b-2 border-red-500' 
                : 'bg-gray-900 text-gray-400 hover:text-white'
            }`}
          >
            Upload Session Data
          </button>
          <button
            onClick={() => setActiveTab('track')}
            className={`flex-1 py-4 text-center font-bold text-lg transition-colors ${
              activeTab === 'track' 
                ? 'bg-gray-800 text-red-500 border-b-2 border-red-500' 
                : 'bg-gray-900 text-gray-400 hover:text-white'
            }`}
          >
            Add / Edit Track
          </button>
        </div>

        <div className="p-8 flex-grow">
          
          {/* --- SESSION FORM --- */}
          {activeTab === 'session' && (
            <div className="space-y-6 max-w-xl mx-auto">
              <h2 className="text-xl font-semibold mb-4 text-center">Add New Telemetry File</h2>
              
              <div className="bg-gray-700/50 p-4 rounded-lg border border-gray-600">
                <label className="block text-sm font-medium mb-2 text-gray-300">Select File (CSV or TXT)</label>
                
                {/* 3. Updated Accept Attribute */}
                <input 
                  type="file" 
                  accept=".csv,.txt" 
                  onChange={handleSessionFileChange}
                  className="block w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-red-600 file:text-white hover:file:bg-red-500 cursor-pointer"
                />
              </div>

              {sessionFile && (
                <div className="p-4 bg-gray-700 rounded border border-gray-600">
                  <p className="text-sm"><strong>Selected:</strong> {sessionFile.name}</p>
                  <p className="text-sm"><strong>Data Points:</strong> {plotData.length}</p>
                </div>
              )}

              <div>
                   <label htmlFor="race-track" className="block text-sm font-medium mb-2 text-gray-300">
                       Race Track
                   </label>
                   <RaceTrackSelect onChange={onRaceTrackChange} />
               </div>

              <div className="flex gap-4 mt-6">
                <button onClick={() => navigate('/')} className="flex-1 py-3 px-4 bg-gray-700 hover:bg-gray-600 rounded font-bold transition-colors">Cancel</button>
                <button onClick={handleSaveSession} disabled={!sessionFile || uploading} className="flex-1 py-3 px-4 bg-red-600 hover:bg-red-500 rounded font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed">{uploading ? 'Uploading...' : 'Save Session'}</button>
              </div>
            </div>
          )}

          {/* --- TRACK FORM WITH PREVIEW --- */}
          {activeTab === 'track' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 h-full">
               
               {/* Left Column: Editor */}
               <div className="space-y-6 overflow-y-auto pr-2">
                  <h2 className="text-xl font-semibold mb-4">Track Configuration</h2>
                  
                  <div>
                    <label className="block text-sm font-medium mb-2 text-gray-300">Track Name</label>
                    <input 
                      type="text" 
                      value={trackName}
                      onChange={e => setTrackName(e.target.value)}
                      placeholder="e.g. Silverstone"
                      className="w-full bg-gray-700 border border-gray-600 rounded p-2 text-white focus:border-red-500 focus:outline-none"
                    />
                  </div>

                  <div className="bg-gray-700/50 p-4 rounded-lg border border-gray-600">
                  <div className="flex justify-between items-center mb-2">
                    <label className="block text-sm font-medium text-gray-300">Track Layout (GeoJSON)</label>
                    <button 
                      onClick={openTrackSelector}
                      className="text-xs bg-gray-600 hover:bg-gray-500 text-white px-2 py-1 rounded transition-colors"
                    >
                      Edit Existing
                    </button>
                  </div>

                  {/* Selection Menu (appears when Edit is clicked) */}
                  {isEditMode && (
                    <div className="mb-4 p-3 bg-gray-800 rounded border border-blue-500/50">
                      <label className="block text-xs text-blue-400 mb-1">Select a Track to load:</label>
                      <select 
                        onChange={(e) => handleEditExistingTrack(Number(e.target.value))}
                        defaultValue=""
                        className="w-full bg-gray-900 text-sm p-2 rounded border border-gray-700 focus:outline-none"
                      >
                        <option value="" disabled>Choose track...</option>
                        {existingTracks.map(t => (
                          <option key={t.id} value={t.id}>{t.name}</option>
                        ))}
                      </select>
                      <button 
                        onClick={() => setIsEditMode(false)}
                        className="mt-2 text-xs text-gray-400 hover:text-white underline"
                      >
                        Cancel
                      </button>
                    </div>
                  )}

                  <input 
                    type="file" 
                    accept=".json,.geojson"
                    onChange={handleLayoutFileChange}
                    className="block w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-600 file:text-white hover:file:bg-blue-500 cursor-pointer"
                  />
                </div>

                  <div className="bg-gray-700/50 p-4 rounded-lg border border-gray-600">
                    <label className="block text-sm font-medium mb-2 text-gray-300">Gates Data (JSON)</label>
                    <input 
                      type="file" 
                      accept=".json"
                      onChange={handleGatesFileChange}
                      className="block w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-green-600 file:text-white hover:file:bg-green-500 cursor-pointer"
                    />
                  </div>

                  {/* Gate List Editor */}
                  <div className="bg-gray-700/30 p-4 rounded-lg border border-gray-600">
                      <h3 className="font-medium text-gray-300 mb-2">Gates ({previewGates.length})</h3>
                      <div className="max-h-40 overflow-y-auto space-y-2 mb-4 pr-1 scrollbar-thin scrollbar-thumb-gray-500">
                          {previewGates.map((gate, i) => (
                              <div key={i} className="flex justify-between items-center bg-gray-800 p-2 rounded text-xs border border-gray-600">
                                  <span className="font-bold text-gray-300 w-8">{gate.name}</span>
                                  <div className="text-gray-400 flex flex-col">
                                      <span>{Number(gate.lat1).toFixed(6)}, {Number(gate.lon1).toFixed(6)}</span>
                                      <span>{Number(gate.lat2).toFixed(6)}, {Number(gate.lon2).toFixed(6)}</span>
                                  </div>
                                  <button 
                                    onClick={() => handleDeleteGate(i)} 
                                    className="text-red-400 hover:text-red-300 hover:bg-red-900/30 rounded p-1"
                                  >
                                      ✕
                                  </button>
                              </div>
                          ))}
                      </div>
                      
                      {/* Manual Add Form */}
                     <div className="grid grid-cols-2 gap-2 text-sm bg-gray-800 p-2 rounded border border-gray-600">
                      <input 
                          placeholder="Name (e.g. S3)" 
                          value={newGate.name} 
                          onChange={e => setNewGate({...newGate, name: e.target.value})} 
                          className="bg-gray-700 p-1 rounded col-span-2 text-white border border-gray-600 focus:border-blue-500 focus:outline-none" 
                      />
                      <input 
                          placeholder="Lat 1" 
                          type="number" 
                          value={newGate.lat1} 
                          onChange={e => setNewGate({...newGate, lat1: e.target.value})} 
                          className="bg-gray-700 p-1 rounded text-white border border-gray-600 focus:border-blue-500 focus:outline-none" 
                      />
                      <input 
                          placeholder="Lon 1" 
                          type="number" 
                          value={newGate.lon1} 
                          onChange={e => setNewGate({...newGate, lon1: e.target.value})} 
                          className="bg-gray-700 p-1 rounded text-white border border-gray-600 focus:border-blue-500 focus:outline-none" 
                      />
                      <input 
                          placeholder="Lat 2" 
                          type="number" 
                          value={newGate.lat2} 
                          onChange={e => setNewGate({...newGate, lat2: e.target.value})} 
                          className="bg-gray-700 p-1 rounded text-white border border-gray-600 focus:border-blue-500 focus:outline-none" 
                      />
                      <input 
                          placeholder="Lon 2" 
                          type="number" 
                          value={newGate.lon2} 
                          onChange={e => setNewGate({...newGate, lon2: e.target.value})} 
                          className="bg-gray-700 p-1 rounded text-white border border-gray-600 focus:border-blue-500 focus:outline-none" 
                      />
                      
                      {/* Action Buttons */}
                      <button 
                          onClick={handleClearForm} 
                          className="bg-gray-600 hover:bg-gray-500 py-1 rounded font-bold mt-1 text-white transition-colors"
                      >
                          Clear
                      </button>
                      <button 
                          onClick={handleAddGate} 
                          className="bg-green-600 hover:bg-green-500 py-1 rounded font-bold mt-1 text-white transition-colors"
                      >
                          Add Gate
                      </button>
                  </div>
                  </div>
                  <div className="pt-2 border-t border-gray-700 mt-4">
                    {!wizardActive ? (
                      <button 
                        onClick={generateFSKinematicGates}
                        disabled={!previewLayout || uploading}
                        className="w-full py-2 px-4 mb-2 bg-blue-600 hover:bg-blue-500 rounded font-bold transition-colors flex items-center justify-center gap-2"
                      >
                        ✨ Start Auto-Gate Wizard
                      </button>
                    ) : (
                      <div className="bg-gray-700 p-3 rounded-lg border border-blue-500 space-y-3">
                        <div className="flex justify-between items-center">
                          <span className="text-blue-400 font-bold text-xs uppercase">
                            Wizard: {currentTurnIdx + 1} / {detectedTurns.length}
                          </span>
                          <button onClick={() => setIsClockwise(!isClockwise)} className="p-1 hover:bg-gray-600 rounded">
                             <TbArrowsRightLeft className={`size-5 ${isClockwise ? 'text-green-400' : 'text-orange-400'}`} />
                          </button>
                        </div>

                        {/* NEW: Turn Name Input */}
                        <div>
                          <label className="text-[10px] text-gray-400 block mb-1">Turn Name:</label>
                          <input 
                            type="text"
                            value={currentTurnName}
                            onChange={(e) => setCurrentTurnName(e.target.value)}
                            className="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1 text-sm focus:border-blue-500 focus:outline-none"
                            placeholder="e.g. Tarzan, Bus Stop..."
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <button onClick={skipTurn} className="py-1 bg-gray-600 hover:bg-gray-500 rounded text-xs">Skip</button>
                          <button onClick={confirmTurn} className="py-1 bg-green-600 hover:bg-green-500 rounded text-xs font-bold">Confirm Turn</button>
                        </div>
                        
                        <button onClick={() => setWizardActive(false)} className="w-full py-1 text-gray-400 hover:text-white text-[10px] underline">
                          Cancel Wizard
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="pt-2">
                      <button 
                        onClick={handleSaveTrack}
                        disabled={!trackName || !previewLayout || uploading}
                        className="w-full py-3 px-4 bg-red-600 hover:bg-red-500 rounded font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {uploading ? 'Saving...' : 'Save Track Configuration'}
                      </button>
                  </div>

               </div>

               {/* Right Column: Map Preview */}
               <div className="bg-gray-700 rounded-lg overflow-hidden border border-gray-600 relative h-[600px] lg:h-auto flex flex-col">
                  <div className="absolute top-2 left-2 z-10 bg-black/50 px-2 py-1 rounded text-xs text-white">
                      Preview Mode
                  </div>
                  {previewLayout ? (
                  <MapChartEditable 
  geoData={previewLayout}
  // YOU MUST ADD wizardPreviewGates HERE:
  gates={[...previewGates, ...activeDrawingGate, ...wizardPreviewGates]} 
  rotation={-90}
  onMapClick={handleMapClick}
  onPointRightClick={handleGateDelete}
/>
                  ) : (
                      <div className="flex h-full items-center justify-center text-gray-400 flex-col gap-2">
                          <span className="text-4xl">🗺️</span>
                          <span>Upload a Layout file to see the map</span>
                      </div>
                  )}
               </div>

            </div>
          )}

        </div>
      </div>
    </div>
  );
}