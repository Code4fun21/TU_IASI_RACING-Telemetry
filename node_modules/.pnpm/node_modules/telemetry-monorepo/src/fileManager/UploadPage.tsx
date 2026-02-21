import React, { useState,useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import Papa from 'papaparse';
import { api } from '../services/api'; 
import RaceTrackSelect from "../pages/MQTT/Components/RaceTrackSelect";
import MapChartEditable from '../components/MapChartEditable';

// --- Types & Interfaces ---

interface Gate {
  name: string;
  lat1: number;
  lon1: number;
  lat2: number;
  lon2: number;
  isPreview?: boolean; 
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

export default function UploadPage() {
  const navigate = useNavigate();
  
  // --- TABS STATE ---
  const [activeTab, setActiveTab] = useState<'session' | 'track'>('session');
  const [uploading, setUploading] = useState<boolean>(false);

  // --- SESSION STATE ---
  const [sessionFile, setSessionFile] = useState<File | null>(null);
  const [plotData, setPlotData] = useState<any[]>([]);
  const [trackId, setTrackId] = useState<string>("1"); 

  // --- TRACK STATE ---
  const [trackName, setTrackName] = useState<string>("");
  const [layoutFile, setLayoutFile] = useState<File | null>(null);
  const [gatesFile, setGatesFile] = useState<File | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [existingTracks, setExistingTracks] = useState<any[]>([]); // To hold list of tracks

  // --- PREVIEW & EDIT STATE ---
  const [previewLayout, setPreviewLayout] = useState<any>(null);
  const [previewGates, setPreviewGates] = useState<Gate[]>([]);
  const [selectedTrackId, setSelectedTrackId] = useState<number | null>(null);
  
  // Form state for manual entry
  const [newGate, setNewGate] = useState<NewGateForm>({ 
    name: "", lat1: "", lon1: "", lat2: "", lon2: "" 
  });

  // --- RUBBER BAND GATE DRAWING STATE ---
  const [gateStart, setGateStart] = useState<Coordinate | null>(null);

  // ==========================
  // 1. SESSION LOGIC
  // ==========================
  
  const onRaceTrackChange = (track: TrackData) => {
    if (track && track.id) {
        setTrackId(String(track.id));
    }
  };

  const handleSessionFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    // 1. Validation: Allow CSV or TXT
    const validExtensions = ['.csv', '.txt'];
    const fileExtension = selectedFile.name.slice(selectedFile.name.lastIndexOf('.')).toLowerCase();

    // Check MIME type OR extension (MIME types can be unreliable for .txt/csv across OSs)
    const isValidType = 
        selectedFile.type === 'text/csv' || 
        selectedFile.type === 'text/plain' || 
        selectedFile.type === 'application/vnd.ms-excel' ||
        validExtensions.includes(fileExtension);

    if (!isValidType) {
        alert("Please upload a valid .csv or .txt file.");
        return;
    }

    setSessionFile(selectedFile);

    // Papa Parse handles delimiters automatically for both .csv and .txt
    Papa.parse(selectedFile, {
      header: true,
      dynamicTyping: true,
      complete: (results) => {
        setPlotData(results.data); 
      },
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

      // 2. Dynamic Renaming: Replace extension with _decoded.json
      // This regex replaces .csv OR .txt (case insensitive) at the end of the string
      const decodedName = storedFileName.replace(/\.(csv|txt)$/i, '') + '_decoded.json';

      const sessionMeta: SessionMeta = {
        csvFileName: storedFileName,
        decodedFileName: decodedName,
        trackId: Number(trackId),
        date: dateTime.date,
        time: dateTime.time,
        driverId: 1,
        monopostId: 1
      };

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

  // ==========================
  // 2. TRACK LOGIC & PREVIEW
  // ==========================
  
  const readJsonFile = (file: File): Promise<any> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const json = JSON.parse(e.target?.result as string);
          resolve(json);
        } catch (err) {
          reject(new Error("File is not valid JSON"));
        }
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

        // --- NEW: Set ID and Enter Edit Mode ---
        setSelectedTrackId(selectedTrackId);
        setTrackName(track.name || "");
        
        const layoutBlob = await api.downloadFile(track.coordinates);
        const gatesBlob = await api.downloadFile(track.gates);

        setPreviewLayout(JSON.parse(await layoutBlob.text()));
        setPreviewGates(JSON.parse(await gatesBlob.text()));
        
        setIsEditMode(false); 
    } catch (err: any) {
        alert("Error loading existing track: " + err.message);
    } finally {
        setUploading(false);
    }
};

// Function to open the selection menu and fetch track list
const openTrackSelector = async () => {
    // REPLACE THIS: Line to get all tracks for the dropdown
    const tracks = await api.getTracks(); 
    setExistingTracks(tracks);
    setIsEditMode(true);
};

  // Gate Editing (Manual Form)
  const handleAddGate = (e: React.MouseEvent<HTMLButtonElement>) => {
  e.preventDefault();

  const gate: Gate = {
    name: newGate.name || `G${previewGates.length + 1}`,
    lat1: Number(newGate.lat1),
    lon1: Number(newGate.lon1),
    lat2: Number(newGate.lat2),
    lon2: Number(newGate.lon2),
  };

  // Validation: Ensure all 4 coordinates are valid numbers
  if ([gate.lat1, gate.lon1, gate.lat2, gate.lon2].some(n => isNaN(n))) {
    alert("Please provide both points by clicking the map or entering manually.");
    return;
  }


  setPreviewGates([...previewGates, gate]);

  // Reset the form for the next gate
  setNewGate({ name: "", lat1: "", lon1: "", lat2: "", lon2: "" });
};


  const handleClearForm = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    setNewGate({ name: "", lat1: "", lon1: "", lat2: "", lon2: "" });
    setGateStart(null); // Resets the map click sequence
  };

  const handleDeleteGate = (index: number) => {
      const updated = previewGates.filter((_, i) => i !== index);
      setPreviewGates(updated);
  };

  // ==========================
  // 3. MAP INTERACTION (Visual Gate Creator)
  // ==========================


const activeDrawingGate = useMemo(() => {
  if (!newGate.lat1 || !newGate.lon1) return [];
  
  return [{
    name: "New Point",
    lat1: Number(newGate.lat1),
    lon1: Number(newGate.lon1),
    // Use Lat1 as Lat2 if the second point isn't clicked yet so it shows as a dot
    lat2: newGate.lat2 ? Number(newGate.lat2) : Number(newGate.lat1),
    lon2: newGate.lon2 ? Number(newGate.lon2) : Number(newGate.lon1),
    isPreview: true
  }];
}, [newGate]);

const handleMapClick = (coords: Coordinate) => {
  // We use a functional update to ensure we have the latest 'newGate' state
  setNewGate((prev) => {
    // If Lat 1 is empty, fill point 1
    if (!prev.lat1) {
      return {
        ...prev,
        lat1: coords.lat.toString(),
        lon1: coords.lon.toString(),
      };
    } 
    // If Lat 1 is full but Lat 2 is empty, fill point 2
    if (!prev.lat2) {
      return {
        ...prev,
        lat2: coords.lat.toString(),
        lon2: coords.lon.toString(),
      };
    }
    // If both are full, overwrite point 2 (or you could reset and start over)
    return {
      ...prev,
      lat2: coords.lat.toString(),
      lon2: coords.lon.toString(),
    };
  });
};

// --- Add logic for Right-Click Delete ---
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
        // 1. Convert current UI state (Map + Gates) into JSON Files
        const layoutBlob = new Blob([JSON.stringify(previewLayout)], { type: "application/json" });
        const gatesBlob = new Blob([JSON.stringify(previewGates)], { type: "application/json" });
        
        const finalLayoutFile = new File([layoutBlob], `${trackName}_layout.json`);
        const finalGatesFile = new File([gatesBlob], `${trackName}_gates.json`);

        // 2. Upload the new versions of the files
        const storedLayoutName = await api.uploadFile(finalLayoutFile);
        const storedGatesName = await api.uploadFile(finalGatesFile);

        if (selectedTrackId) {
            console.log("Updating track with ID:", selectedTrackId); // Debugging line
            
            // Ensure selectedTrackId is a valid number/string before sending
            await api.updateTrack(selectedTrackId, {
                name: trackName,
                gates: storedGatesName,
                coordinates: storedLayoutName 
            });
            alert("✅ Track Configuration Updated!");
        } else {
            // --- MODE: CREATE NEW ---
            await api.saveTrack({
                name: trackName,
                gates: storedGatesName,
                coordinates: storedLayoutName 
            });
            alert("✅ New Track Saved Successfully!");
        }

        // 3. Reset all states to clear the form
        setTrackName("");
        setLayoutFile(null);
        setGatesFile(null);
        setPreviewLayout(null);
        setPreviewGates([]);
        setSelectedTrackId(null); // Critical: Exit edit mode
        setGateStart(null);

    } catch (error: any) {
        console.error(error);
        alert(`❌ Error: ${error.message}`);
    } finally {
        setUploading(false);
    }
};

  // ==========================
  // RENDER
  // ==========================
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
                      📂 Edit Existing
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
                  gates={[...previewGates, ...activeDrawingGate]} // Pass combined list
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