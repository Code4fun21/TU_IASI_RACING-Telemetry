"use client";

import { useState, useEffect } from "react";
import { GiFullMotorcycleHelmet } from "react-icons/gi";
import { MdCarRepair } from "react-icons/md";
import { BsFillRecordCircleFill } from "react-icons/bs";
import DriverSelect from "../../MQTT/Components/DriverSelect";
import MonopostSelect from "../../MQTT/Components/MonopostSelect";
import { createTimestamp } from "../../../api/timestamps.routes"; // ← adjust path

export default function TopActionBar() {
  const [driver, setDriver] = useState(null);
  const [setup,  setSetup]  = useState(null);

  const [isRecording, setIsRecording] = useState(false);
  const [startTime,    setStartTime]    = useState(null);

  const handleStart = () => {
    setStartTime(new Date().toISOString());
    setIsRecording(true);
  };

  const handleStop = async () => {
    const endTime = new Date().toISOString();
    try {
      await createTimestamp({
        startTime,
        endTime,
        driverId: driver?.id ?? null,
        setupId:  setup?.id  ?? null,
      });
      console.log("Timestamp saved:", { startTime, endTime, driver, setup });
    } catch (err) {
      console.error("Failed to save timestamp", err);
    } finally {
      setIsRecording(false);
      setStartTime(null);
    }
  };

  return (
    <div>
      <h2 className="text-sm font-medium text-gray-500">Session Settings</h2>
      <ul className="mt-3 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {/* Driver */}
        <li className="flex shadow rounded overflow-hidden">
          <div className="bg-pink-600 w-16 flex items-center justify-center text-white">
            <GiFullMotorcycleHelmet size={32} />
          </div>
          <div className="flex-1 border border-gray-200 px-4 py-2">
            <DriverSelect value={driver} onChange={setDriver} />
          </div>
        </li>

        {/* Monopost */}
        <li className="flex shadow rounded overflow-hidden">
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
                ? `Started at ${new Date(startTime).toLocaleTimeString()}`
                : "Idle"}
            </div>
          </div>
        </li>
      </ul>
    </div>
  );
}
