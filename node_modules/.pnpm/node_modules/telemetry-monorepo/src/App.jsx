import { BrowserRouter as Router, Route, Routes } from "react-router-dom";
import { TelemetryProvider } from "./store/OfflineDataStoreadge";

import Home from "./Home";
import Layout from "./Layout";
import Dashboard from "./pages/Dashboard";
import OfflineFiles from "./pages/OfflineFiles";
import LongerCharts from "./pages/LongerCharts";
import MonopostInfoPage from "./pages/MonopostInfoPage";
import LiveDashboard from "./pages/MQTT/LiveDashboard";
import DataInput from "./pages/DataInput/DataInput";
import AdvanceChartsOffline from "./pages/Offline/AdvanceChartsOffline";
import MqttAuth from "./pages/MQTT/MqttAuth";
import UploadPage from "./fileManager/UploadPage"; 

// Context providers
// DELETED: import { SocketProvider } from "./context/SocketContext"; 
import { DriverProvider } from "./context/DriverContext";

function App() {
    return (
        // The DriverProvider is fine to keep for UI state (Driver Name, Weight, etc.)
        <DriverProvider>
            <TelemetryProvider>
                <Router>
                    <Routes>
                        <Route path="/" element={<Home />} />
                        
                        {/* Offline File Upload Mode */}
                        <Route path="add-file" element={<UploadPage />} />

                        <Route element={<Layout />}>
                            <Route path="live" element={<Dashboard />} />
                            <Route path="from-file" element={<Dashboard />} />
                            <Route path="longer-charts" element={<LongerCharts />} />
                            <Route path="monopost-info" element={<MonopostInfoPage />} />
                            <Route path="live-dashboard" element={<LiveDashboard />} />
                            <Route path="data-input" element={<DataInput />} />
                            <Route path="offline-data" element={<Dashboard />} />
                            <Route path="offline-advance-charts" element={<AdvanceChartsOffline />} />
                        </Route>
                        
                        <Route path="offline-files" element={<OfflineFiles />} />
                        
                        {/* Live MQTT Start Page */}
                        <Route path="mqtt-auth" element={<MqttAuth />} />
                    </Routes>
                </Router>
            </TelemetryProvider>
        </DriverProvider>
    );
}

export default App;