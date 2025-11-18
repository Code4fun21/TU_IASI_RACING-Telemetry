import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Papa from 'papaparse';
import { api } from '../services/api'; 
import type { Session } from '@telemetry/shared';

export default function UploadPage() {
  const navigate = useNavigate();
  
  const [file, setFile] = useState<File | null>(null);
  const [plotData, setPlotData] = useState<any[]>([]); // Data for preview
  const [uploading, setUploading] = useState(false);

  // Metadata State (Simple inputs for now)
  const [driverId, setDriverId] = useState("1");
  const [trackId, setTrackId] = useState("1");
  const [monopostId, setMonopostId] = useState("1");

  // 1. Handle File Selection & Local Parsing
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    
    if (!selectedFile) return;

    setFile(selectedFile);

    // Parse immediately for preview
    Papa.parse(selectedFile, {
      header: true,
      dynamicTyping: true,
      complete: (results) => {
        console.log("Preview Data:", results.data.slice(0, 5)); // Log first 5 rows
        setPlotData(results.data); 
      },
      error: (err) => {
        console.error("CSV Error:", err);
        alert("Error parsing CSV file");
      }
    });
  };

  // 2. Upload & Save
  const handleSave = async () => {
    if (!file) return;
    setUploading(true);

    try {
      // A. Upload File to R2 via Worker
      const storedFileName = await api.uploadFile(file);

      // B. Save Metadata to D1
      const sessionMeta: Session = {
        csvFileName: storedFileName,
        driverId: Number(driverId),
        trackId: Number(trackId),
        monopostId: Number(monopostId),
        startTime: Date.now(), // You might want to parse this from the CSV later
        endTime: Date.now() + 1000, 
      };

      await api.saveSession(sessionMeta);
      
      alert("? Session Saved!");
      navigate('/'); // Go back home or to the "View Files" list
    } catch (error) {
      console.error(error);
      alert("? Failed to upload session.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8 flex flex-col items-center">
      <div className="max-w-2xl w-full bg-gray-800 rounded-lg shadow-xl p-6">
        <h2 className="text-2xl font-bold mb-6 text-center">Add New Data File</h2>

        {/* File Input */}
        <div className="mb-6">
          <label className="block text-sm font-medium mb-2">Select CSV File</label>
          <input 
            type="file" 
            accept=".csv"
            onChange={handleFileChange}
            className="block w-full text-sm text-gray-400
              file:mr-4 file:py-2 file:px-4
              file:rounded-full file:border-0
              file:text-sm file:font-semibold
              file:bg-red-600 file:text-white
              hover:file:bg-red-500"
          />
        </div>

        {/* Preview Info */}
        {file && (
          <div className="mb-6 p-4 bg-gray-700 rounded">
            <p><strong>File:</strong> {file.name}</p>
            <p><strong>Rows detected:</strong> {plotData.length}</p>
          </div>
        )}

        {/* Metadata Inputs */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div>
            <label className="block text-xs mb-1">Driver ID</label>
            <input 
              type="number" 
              value={driverId}
              onChange={e => setDriverId(e.target.value)}
              className="w-full bg-gray-700 rounded p-2 text-white"
            />
          </div>
          <div>
            <label className="block text-xs mb-1">Track ID</label>
            <input 
              type="number" 
              value={trackId}
              onChange={e => setTrackId(e.target.value)}
              className="w-full bg-gray-700 rounded p-2 text-white"
            />
          </div>
          <div>
            <label className="block text-xs mb-1">Car ID</label>
            <input 
              type="number" 
              value={monopostId}
              onChange={e => setMonopostId(e.target.value)}
              className="w-full bg-gray-700 rounded p-2 text-white"
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-4">
          <button 
            onClick={() => navigate('/')}
            className="flex-1 py-2 px-4 bg-gray-600 hover:bg-gray-500 rounded font-bold"
          >
            Cancel
          </button>
          <button 
            onClick={handleSave}
            disabled={!file || uploading}
            className="flex-1 py-2 px-4 bg-red-600 hover:bg-red-500 rounded font-bold disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {uploading ? 'Uploading...' : 'Save to Cloud'}
          </button>
        </div>
      </div>
    </div>
  );
}

