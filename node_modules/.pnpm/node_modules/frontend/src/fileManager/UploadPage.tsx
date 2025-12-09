import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Papa from 'papaparse';
import { api } from '../services/api'; 

export default function UploadPage() {
  const navigate = useNavigate();
  
  // --- TABS STATE ---
  const [activeTab, setActiveTab] = useState<'session' | 'track'>('session');
  const [uploading, setUploading] = useState(false);

  // --- SESSION STATE ---
  const [sessionFile, setSessionFile] = useState<File | null>(null);
  const [plotData, setPlotData] = useState<any[]>([]);
  const [trackId, setTrackId] = useState("1"); 

  // --- TRACK STATE ---
  const [trackName, setTrackName] = useState("");
  const [layoutFile, setLayoutFile] = useState<File | null>(null);
  const [gatesFile, setGatesFile] = useState<File | null>(null);

  // ==========================
  // 1. SESSION LOGIC
  // ==========================
  const handleSessionFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;
    setSessionFile(selectedFile);

    // Preview
    Papa.parse(selectedFile, {
      header: true,
      dynamicTyping: true,
      complete: (results) => {
        setPlotData(results.data); 
      },
      error: (err) => alert("Error parsing CSV: " + err)
    });
  };

  const convertUnixToDate = (unixTimestamp: number) => {
    const timestamp = String(unixTimestamp).length === 10 ? unixTimestamp * 1000 : unixTimestamp;
    const dateObj = new Date(timestamp);
    return {
      date: dateObj.toLocaleDateString('en-CA'), // YYYY-MM-DD
      time: dateObj.toLocaleTimeString('en-GB', { hour12: false }) // HH:MM:SS
    };
  };

  const handleSaveSession = async () => {
    if (!sessionFile) return;
    setUploading(true);

    try {
      const storedFileName = await api.uploadFile(sessionFile);
      const dateTime = convertUnixToDate(sessionFile.lastModified);

      const sessionMeta = {
        csvFileName: storedFileName,
        decodedFileName:`${storedFileName}-decoded.json`,
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
  // 2. TRACK LOGIC & VALIDATION
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

  const validateGates = (data: any) => {
    if (!Array.isArray(data)) {
      throw new Error("Gates file must be an Array of gate objects.");
    }
    if (data.length === 0) {
      throw new Error("Gates file is empty.");
    }
    const sample = data[0];
    const requiredKeys = ["name", "lat1", "lon1", "lat2", "lon2"];
    for (const key of requiredKeys) {
      if (!(key in sample)) {
        throw new Error(`Invalid Gates format. Missing key: '${key}' in first item.`);
      }
    }
  };

  const validateLayout = (data: any) => {
    if (typeof data !== 'object' || data === null) {
      throw new Error("Layout file must be a JSON Object.");
    }
    if (data.type !== "FeatureCollection") {
      throw new Error("Layout file must be a GeoJSON 'FeatureCollection'.");
    }
    if (!Array.isArray(data.features)) {
      throw new Error("Layout file is missing the 'features' array.");
    }
  };

  const handleSaveTrack = async () => {
    if (!trackName || !layoutFile || !gatesFile) {
      alert("Please fill in all track fields.");
      return;
    }
    setUploading(true);

    try {
      const layoutJson = await readJsonFile(layoutFile);
      const gatesJson = await readJsonFile(gatesFile);
      
      // Validate
      validateLayout(layoutJson);
      validateGates(gatesJson);

      
      const storedLayoutName = await api.uploadFile(layoutFile);
      const storedGatesName = await api.uploadFile(gatesFile);


      await api.saveTrack({
          name: trackName,
          gates: storedGatesName,       
          coordinates: storedLayoutName 
      });
      

      alert("✅ Track Saved Successfully!");
      setTrackName("");
      setLayoutFile(null);
      setGatesFile(null);

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
    <div className="flex min-h-screen items-center justify-center bg-gray-900 text-white p-6">
      <div className="max-w-3xl w-full bg-gray-800 rounded-lg shadow-2xl overflow-hidden border border-gray-700">
        
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
            Add New Track
          </button>
        </div>

        <div className="p-8">
          
          {/* --- SESSION FORM --- */}
          {activeTab === 'session' && (
            <div className="space-y-6">
              <h2 className="text-xl font-semibold mb-4 text-center">Add New Telemetry File</h2>
              <div className="bg-gray-700/50 p-4 rounded-lg border border-gray-600">
                <label className="block text-sm font-medium mb-2 text-gray-300">Select CSV File</label>
                <input 
                  type="file" 
                  accept=".csv"
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
                <label className="block text-sm font-medium mb-2 text-gray-300">Track ID</label>
                <input 
                  type="number" 
                  value={trackId}
                  onChange={e => setTrackId(e.target.value)}
                  className="w-full bg-gray-700 border border-gray-600 rounded p-2 text-white focus:border-red-500 focus:outline-none"
                />
              </div>
              <div className="flex gap-4 mt-6">
                <button onClick={() => navigate('/')} className="flex-1 py-3 px-4 bg-gray-700 hover:bg-gray-600 rounded font-bold transition-colors">Cancel</button>
                <button onClick={handleSaveSession} disabled={!sessionFile || uploading} className="flex-1 py-3 px-4 bg-red-600 hover:bg-red-500 rounded font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed">{uploading ? 'Uploading...' : 'Save Session'}</button>
              </div>
            </div>
          )}

          {/* --- TRACK FORM --- */}
          {activeTab === 'track' && (
            <div className="space-y-6">
              <h2 className="text-xl font-semibold mb-4 text-center">Register New Track Layout</h2>
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
                <label className="block text-sm font-medium mb-2 text-gray-300">Track Layout (GeoJSON)</label>
                <input 
                  type="file" 
                  accept=".json,.geojson"
                  onChange={(e) => setLayoutFile(e.target.files?.[0] || null)}
                  className="block w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-600 file:text-white hover:file:bg-blue-500 cursor-pointer"
                />
              </div>
              <div className="bg-gray-700/50 p-4 rounded-lg border border-gray-600">
                <label className="block text-sm font-medium mb-2 text-gray-300">Gates Data (JSON)</label>
                <input 
                  type="file" 
                  accept=".json"
                  onChange={(e) => setGatesFile(e.target.files?.[0] || null)}
                  className="block w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-green-600 file:text-white hover:file:bg-green-500 cursor-pointer"
                />
              </div>
              <div className="flex gap-4 mt-6">
                <button onClick={() => navigate('/')} className="flex-1 py-3 px-4 bg-gray-700 hover:bg-gray-600 rounded font-bold transition-colors">Cancel</button>
                <button onClick={handleSaveTrack} disabled={!trackName || !layoutFile || !gatesFile || uploading} className="flex-1 py-3 px-4 bg-red-600 hover:bg-red-500 rounded font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed">{uploading ? 'Saving...' : 'Save Track'}</button>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}