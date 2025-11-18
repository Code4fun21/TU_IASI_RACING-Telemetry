"use client";
import React from "react";
import { useState, useEffect } from "react";
import { GiFullMotorcycleHelmet } from "react-icons/gi";
import { MdCarRepair } from "react-icons/md";
import { BsFillRecordCircleFill } from "react-icons/bs";
import DriverSelect from "../../MQTT/Components/DriverSelect";
import MonopostSelect from "../../MQTT/Components/MonopostSelect";
import { createTimestamp } from "../../../api/timestamps.routes";

export default function TopActionBar({ sessionId }) {
  
  const [driver, setDriver] = useState(null);
  const [setup, setSetup] = useState(null);

  const [isRecording, setIsRecording] = useState(false);
  const [startTime, setStartTime]     = useState(null);
  const [elapsed, setElapsed]         = useState(0); // milliseconds

  // Start button handler
  const handleStart = () => {
    const nowIso = new Date().toISOString();
    setStartTime(nowIso);
    setElapsed(0);
    setIsRecording(true);
  };

  // Stop button handler
  const handleStop = async () => {
    const endIso = new Date().toISOString();
    clearInterval(timerRef.current);
    setIsRecording(false);

    try {
      await createTimestamp({
        sessionId,
        startTime,
        endTime: endIso,
        driverId: driver?.id ?? null,
        setupId:  setup?.id  ?? null,
      });
      console.log("Timestamp saved:", { sessionId, startTime, endIso, driver, setup });
    } catch (err) {
      console.error("Failed to save timestamp", err);
    } finally {
      setStartTime(null);
    }
  };

  // Keep a ref to the timer so we can clear it
  const timerRef = React.useRef(null);
  useEffect(() => {
    if (isRecording && startTime) {
      // update every second
      timerRef.current = setInterval(() => {
        const now = Date.now();
        const then = Date.parse(startTime);
        setElapsed(now - then);
      }, 1000);
    }
    return () => clearInterval(timerRef.current);
  }, [isRecording, startTime]);

  // format elapsed ms into H:MM:SS or MM:SS
  // format elapsed ms into H:MM:SS (only show HH: when hrs>0) or MM:SS
const formatElapsed = (ms) => {
  const totalSec = Math.floor(ms / 1000);
  const hrs  = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  const pad  = (n) => n.toString().padStart(2, "0");

  if (hrs > 0) {
    // show hours, two‑digit padded
    return `${pad(hrs)}:${pad(mins)}:${pad(secs)}`;
  } else {
    // hide hours
    return `${pad(mins)}:${pad(secs)}`;
  }
};


  return (
    <div>
      <h2 className="text-sm font-medium text-gray-500">Session Settings</h2>
      <ul className="mt-3 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {/* Driver */}
        <li className="flex shadow rounded overflow-visible">
          <div className="bg-pink-600 w-16 flex items-center justify-center text-white">
            <GiFullMotorcycleHelmet size={32} />
          </div>
          <div className="flex-1 border border-gray-200 px-4 py-2">
            <DriverSelect value={driver} onChange={setDriver} />
          </div>
        </li>

        {/* Monopost */}
        <li className="flex shadow rounded overflow-visible">
          <div className="bg-purple-600 w-16 flex items-center justify-center text-white">
            <MdCarRepair size={32} />
          </div>
          <div className="flex-1 border border-gray-200 px-4 py-2">
            <MonopostSelect value={setup} onChange={setSetup} />
          </div>
        </li>

        {/* Record */}
        <li className="flex shadow rounded overflow-hidden">
          <div className="bg-green-500 w-16 flex items-center justify-center text-white">
            <BsFillRecordCircleFill size={28} />
          </div>
          <div className="flex-1 border border-gray-200 px-4 py-2 flex items-center justify-between">
            <div className="space-x-2">
              <button
                onClick={handleStart}
                disabled={isRecording || !driver || !setup}
                className={`px-3 py-1 rounded ${
                  isRecording || !driver || !setup
                    ? "bg-gray-200 text-gray-500 cursor-not-allowed"
                    : "bg-green-600 text-white hover:bg-green-500"
                }`}
              >
                Start
              </button>
              <button
                onClick={handleStop}
                disabled={!isRecording}
                className={`px-3 py-1 rounded ${
                  !isRecording
                    ? "bg-gray-200 text-gray-500 cursor-not-allowed"
                    : "bg-red-600 text-white hover:bg-red-500"
                }`}
              >
                Stop
              </button>
            </div>
            <div className="text-sm text-gray-600">
              {isRecording
                ? `Elapsed: ${formatElapsed(elapsed)}`
                : "Idle"}
            </div>
          </div>
        </li>
      </ul>
    </div>
  );
}
