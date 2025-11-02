import {createSession} from "../../api/sessions.routs";
import backgroundImage from "../../assets/cool-background.png";
import logo from "../../assets/tuiasilogo.png";
import { useNavigate } from "react-router-dom";
import RaceTrackSelect from "./Components/RaceTrackSelect";
import { useState } from "react";
import { connectToTelemetry,startTelemetry } from "../../api/endpoints";



function MqttAuth() {
    const navigate = useNavigate();
    // Default to a track that exists in your database.
    const [raceTrack, setRaceTrack] = useState({ id: 1, name: "Bacau" });

    const handleConnect = async (e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const formData = new FormData(form);

        // This payload must exactly match what the backend controller expects
        const now = new Date();
        // format date as YYYY-MM-DD
        const year  = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day   = String(now.getDate()).padStart(2, '0');
        const dateStr = `${year}-${month}-${day}`;
        // format time as HH-MM-SS
        const hours = String(now.getHours()).padStart(2, '0');
        const mins  = String(now.getMinutes()).padStart(2, '0');
        const secs  = String(now.getSeconds()).padStart(2, '0');
        const timeStr = `${hours}-${mins}-${secs}`;
        // build filename
        const csvFile = `${raceTrack.name}_${dateStr}_${timeStr}.csv`;
        const session_payload={
            csvFile:csvFile,
            trackId:raceTrack.id
        }
        const mqtt_log_payload = {
            trackId: raceTrack.id,
            broker: formData.get("Broker"),
            port: Number(formData.get("Port")),
            topic: formData.get("topic"),
            clientId: formData.get("client_id"),
            fileName:session_payload.csvFile
        };
        console.log("Connecting with payload:", mqtt_log_payload);
        try {
            // Call the backend to establish the MQTT connection and create a session
            const resp = await connectToTelemetry(mqtt_log_payload);
            console.log("Backend response:", resp.data);
            
            
             const sessionResp = await createSession(session_payload);
            const { sessionId, csvFile } = sessionResp.data.sessionData;
            
            alert(`Connection successful! Session ${sessionId} started. Saving to ${csvFile}`);
            // kick off the MQTT loop
            await startTelemetry({ start: true });
            // now navigate *and* carry sessionId along in location.state
            navigate("/live-dashboard", {state: { sessionId, trackId: raceTrack.id }  });
        } catch (err) {
            console.error("Failed to connect to telemetry backend", err?.response);
            // Provide user feedback on failure
            alert("Connection failed: " + (err.response?.data?.message || err.message));
        }
    };

    // Callback function passed to the RaceTrackSelect component
    const onRaceTrackChange = (selectedTrack) => {
        console.log("Selected Track:", selectedTrack);
        setRaceTrack(selectedTrack);
    };

    return (
        <div
            className="flex h-screen items-center justify-center bg-cover bg-center bg-no-repeat px-6 py-12"
            style={{ backgroundImage: `url(${backgroundImage})` }}
        >
            <div className="w-full max-w-sm bg-gray-800/75 rounded-lg p-6 shadow-lg">
                <img alt="Your Company" src={logo} className="mx-auto h-10 w-auto" />
                <form onSubmit={handleConnect} className="mt-6 space-y-4">
                    <div>
                        <label htmlFor="race-track" className="block text-sm font-medium text-gray-200">
                            Race Track
                        </label>
                        <RaceTrackSelect onChange={onRaceTrackChange} />
                    </div>
                    <div>
                        <label htmlFor="Broker" className="block text-sm font-medium text-gray-200">
                            Broker
                        </label>
                        <input
                            id="Broker"
                            name="Broker"
                            type="text"
                            defaultValue="broker.hivemq.com"
                            required
                            className="mt-1 block w-full rounded-md bg-white px-3 py-1.5 text-base text-gray-900 outline-1 outline-gray-300 focus:outline-2 focus:outline-indigo-600"
                        />
                    </div>
                    <div>
                        <label htmlFor="Port" className="block text-sm font-medium text-gray-200">
                            Port
                        </label>
                        <input
                            id="Port"
                            name="Port"
                            type="number"
                            defaultValue={8883}
                            required
                            className="mt-1 block w-full rounded-md bg-white px-3 py-1.5 text-base text-gray-900 outline-1 outline-gray-300 focus:outline-2 focus:outline-indigo-600"
                        />
                    </div>
                    <div>
                        <label htmlFor="topic" className="block text-sm font-medium text-gray-200">
                            Topic
                        </label>
                        <input
                            id="topic"
                            name="topic"
                            type="text"
                            defaultValue="canbus/log"
                            required
                            className="mt-1 block w-full rounded-md bg-white px-3 py-1.5 text-base text-gray-900 outline-1 outline-gray-300 focus:outline-2 focus:outline-indigo-600"
                        />
                    </div>
                    <div>
                        <label htmlFor="client_id" className="block text-sm font-medium text-gray-200">
                            Client ID
                        </label>
                        <input
                            id="client_id"
                            name="client_id"
                            type="text"
                            defaultValue={`web-client-${Math.floor(Math.random() * 1000)}`}
                            required
                            className="mt-1 block w-full rounded-md bg-white px-3 py-1.5 text-base text-gray-900 outline-1 outline-gray-300 focus:outline-2 focus:outline-indigo-600"
                        />
                    </div>
                    <button
                        type="submit"
                        className="w-full rounded-md bg-red-500 px-3 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-red-400 focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-red-500"
                    >
                        Connect and Start Session
                    </button>
                </form>
            </div>
        </div>
    );
}

export default MqttAuth;
