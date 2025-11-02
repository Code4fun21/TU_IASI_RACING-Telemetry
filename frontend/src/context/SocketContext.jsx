// src/context/SocketContext.jsx
import React, { createContext, useContext, useEffect, useState } from "react";
import io from "socket.io-client";
import PropTypes from "prop-types";

const SOCKET_URL = "http://127.0.0.1:8081";
const SocketContext = createContext(null);

export const useSocket = () => useContext(SocketContext);

export function SocketProvider({ children }) {
  const [socket, setSocket] = useState(null);

  useEffect(() => {

    const newSocket = io(SOCKET_URL, {
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
    });


    console.log("[SocketProvider] connecting to", SOCKET_URL);
    newSocket.on("connect", () => console.log("[Socket] connected:", newSocket.id));
    newSocket.on("disconnect", (reason) => console.warn("[Socket] disconnected:", reason));
    setSocket(newSocket);
    return () => {
      newSocket.off();
      newSocket.close();
    };
  }, []);

  return <SocketContext.Provider value={socket}>{children}</SocketContext.Provider>;
}

SocketProvider.propTypes = {
  children: PropTypes.node.isRequired,
};
