import React, { useState, useEffect, useRef } from "react";
import { GiFullMotorcycleHelmet } from "react-icons/gi";
import { MdCarRepair } from "react-icons/md";
import { BsFillRecordCircleFill } from "react-icons/bs";
import DriverSelect from "./DriverSelect";
import MonopostSelect from "./MonopostSelect";
import { api } from "../../../services/api";

export default function TopActionBar({ sessionId }) {
  
  const [driver, setDriver] = useState(null);
  const [setup, setSetup] = useState(null);

  const [isRecording, setIsRecording] = useState(false);
  const [startTime, setStartTime]     = useState(null);
  const [elapsed, setElapsed]         = useState(0); // milliseconds
  const timerRef = useRef(null);

  // Start button handler
  const handleStart = () => {
    const now = Date.now(); // Use Unix Timestamp for consistency
    setStartTime(now);
    setElapsed(0);
    setIsRecording(true);
  };

  // Stop button handler
  const handleStop = async () => {
    const endTime = Date.now();
    clearInterval(timerRef.current);
    setIsRecording(false);

    try {
      // Use the new API service
      const body={
        sessionId: Number(sessionId),
        startTime: startTime, // Sending numbers (ms) is safer for calculations
        endTime: endTime,
        driverId: driver?.id ? Number(driver.id) : null,
        monopostId: setup?.id  ? Number(setup.id)  : null,
      };
      console.log(`timestamp info`,body);
      await api.saveTimestamp(body);
      console.log("Stint saved successfully");
      alert("Driver Stint Saved!");
    } catch (err) {
      console.error("Failed to save timestamp", err);
      alert("Failed to save stint.");
    } finally {
      setStartTime(null);
      setElapsed(0);
    }
  };

  // Timer Effect
  useEffect(() => {
    if (isRecording && startTime) {
      timerRef.current = setInterval(() => {
        setElapsed(Date.now() - startTime);
      }, 1000);
    }
    return () => clearInterval(timerRef.current);
  }, [isRecording, startTime]);

  // Format Helper
  const formatElapsed = (ms) => {
    if (!ms) return "00:00";
    const totalSec = Math.floor(ms / 1000);
    const hrs  = Math.floor(totalSec / 3600);
    const mins = Math.floor((totalSec % 3600) / 60);
    const secs = totalSec % 60;
    const pad  = (n) => n.toString().padStart(2, "0");

    if (hrs > 0) return `${pad(hrs)}:${pad(mins)}:${pad(secs)}`;
    return `${pad(mins)}:${pad(secs)}`;
  };

  return (
    <div className="bg-gray-500/65 p-4 rounded-lg shadow w-full max-w-6xl">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wider">Driver Stint Tracking</h2>
        {sessionId && <span className="text-xs text-gray-400">Session #{sessionId}</span>}
      </div>
      
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {/* Driver */}
        <div className="flex shadow-sm rounded-md overflow-hidden border border-gray-200">
          <div className="bg-pink-600 w-12 flex items-center justify-center text-white">
            <GiFullMotorcycleHelmet size={24} />
          </div>
          <div className="flex-1 px-3 py-2 flex items-center bg-gray-50">
            <DriverSelect value={driver} onChange={setDriver} />
          </div>
        </div>

        {/* Monopost */}
        <div className="flex shadow-sm rounded-md overflow-hidden border border-gray-200">
          <div className="bg-purple-600 w-12 flex items-center justify-center text-white">
            <MdCarRepair size={24} />
          </div>
          <div className="flex-1 px-3 py-2 flex items-center bg-gray-50">
            <MonopostSelect value={setup} onChange={setSetup} />
          </div>
        </div>

        {/* Record Controls */}
        <div className="flex shadow-sm rounded-md overflow-hidden border border-gray-200">
          <div className={`w-12 flex items-center justify-center text-white transition-colors ${isRecording ? "bg-red-500 animate-pulse" : "bg-green-500"}`}>
            <BsFillRecordCircleFill size={20} />
          </div>
          <div className="flex-1 px-3 py-2 flex items-center justify-between bg-gray-50">
            <div className="space-x-2">
              {!isRecording ? (
                <button
                  onClick={handleStart}
                  disabled={!driver || !setup}
                  className={`px-4 py-1 rounded text-sm font-bold shadow-sm transition-colors ${
                    !driver || !setup
                      ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                      : "bg-green-600 text-white hover:bg-green-500"
                  }`}
                >
                  Start Stint
                </button>
              ) : (
                <button
                  onClick={handleStop}
                  className="px-4 py-1 rounded text-sm font-bold shadow-sm bg-red-600 text-white hover:bg-red-500 transition-colors"
                >
                  Stop Stint
                </button>
              )}
            </div>
            <div className="text-lg font-mono font-bold text-gray-700 w-24 text-right">
              {isRecording ? formatElapsed(elapsed) : "00:00"}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}