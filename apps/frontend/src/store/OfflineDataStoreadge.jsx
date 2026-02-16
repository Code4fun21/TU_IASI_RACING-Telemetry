import { createContext, useState, useContext } from "react";

// 1. Create the Context
const TelemetryContext = createContext(null);

// 2. Create the Provider Component
export const TelemetryProvider = ({ children }) => {
    // This state will hold the processed data arrays
    const [telemetryData, setTelemetryData] = useState(null);
    const [sessionInfo, setSessionInfo] = useState(null);

    return (
        <TelemetryContext.Provider value={{ telemetryData, setTelemetryData, sessionInfo, setSessionInfo }}>
            {children}
        </TelemetryContext.Provider>
    );
};

// 3. Custom Hook for easy access
export const useTelemetry = () => useContext(TelemetryContext);