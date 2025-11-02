import { BrowserRouter as Router, Route, Routes } from "react-router-dom";
import Home from "./Home";
import Layout from "./Layout";
import Dashboard from "./pages/Dashboard";
import OfflineFiles from "./pages/OfflineFiles";
import LongerCharts from "./pages/LongerCharts";
import MonopostInfoPage from "./pages/MonopostInfoPage";
import LiveDashboard from "./pages/MQTT/LiveDashboard";
import DataInput from "./pages/DataInput/DataInput";
import AdvanceChartsOffline from "./pages/Offline/AdvanceChartsOffline";
import LiveAdvanceCharts from "./pages/MQTT/MoreCharts/LiveAdvanceCharts";
import MqttAuth from "./pages/MQTT/MqttAuth";

// Context providers
import { SocketProvider } from "./context/SocketContext";
import { DriverProvider } from "./context/DriverContext";

function App() {
    return (
        <DriverProvider>
            <SocketProvider>
                <Router>
                    <Routes>
                        <Route path="/" element={<Home />} />
                        <Route element={<Layout />}>
                            <Route path="live" element={<Dashboard />} />
                            <Route path="from-file" element={<Dashboard />} />
                            <Route path="longer-charts" element={<LongerCharts />} />
                            <Route path="monopost-info" element={<MonopostInfoPage />} />
                            <Route path="live-dashboard" element={<LiveDashboard />} />
                            <Route path="data-input" element={<DataInput />} />
                            <Route path="live-advance-charts" element={<LiveAdvanceCharts />} />
                            <Route path="offline-advance-charts" element={<AdvanceChartsOffline />} />
                        </Route>
                        <Route path="offline-files" element={<OfflineFiles />} />
                        <Route path="mqtt-auth" element={<MqttAuth />} />
                    </Routes>
                </Router>
            </SocketProvider>
        </DriverProvider>
    );
}

export default App;
