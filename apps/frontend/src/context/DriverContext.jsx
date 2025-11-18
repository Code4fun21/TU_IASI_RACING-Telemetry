import React, { createContext, useContext, useState } from "react";

export const DriverContext = createContext(); // 👈 export this

export function DriverProvider({ children }) {
    const [driverData, setDriverData] = useState({  fullName: "",
        height: "",
        weight: "",
        about: "", });

    return (
        <DriverContext.Provider value={{ driverData, setDriverData }}>
            {children}
        </DriverContext.Provider>
    );
}
