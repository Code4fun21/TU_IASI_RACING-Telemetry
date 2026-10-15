import { create } from 'zustand';

interface MqttState {
  isConnected: boolean;
  // 1. Raw Strings (for "Black Box" recording)
  rawBuffer: string[];
  // 2. Decoded Objects (for Charts)
  decodedBuffer: any[];
  // Latest Data (for Gauges)
  currentData: any | null;
  
  // Actions
  addMessage: (raw: string, decoded: any) => void;
  clearBuffer: () => void;
  setStatus: (connected: boolean) => void;
}

// --- HIGH PERFORMANCE TEMPORARY BUFFERS ---
// These live outside React so we can push data to them incredibly fast 
// without triggering UI freezes.
let tempRaw: string[] = [];
let tempDecoded: any[] = [];
let latestData: any = null;
let flushInterval: ReturnType<typeof setInterval> | null = null;

// Enforce a maximum size so the browser doesn't crash from out-of-memory errors
const MAX_BUFFER_SIZE = 5000; 

export const useMqttStore = create<MqttState>((set) => ({
  isConnected: false,
  rawBuffer: [],
  decodedBuffer: [],
  currentData: null,

  addMessage: (raw, decoded) => {
    // 1. Instantly push to hidden arrays (Takes 0.001ms, no React render!)
    tempRaw.push(raw);
    if (decoded) {
      tempDecoded.push(decoded);
      latestData = decoded;
    }

    // 2. Start a batch interval if it's not running
    // This updates the actual React UI at a safe speed (10 times a second)
    if (!flushInterval) {
      flushInterval = setInterval(() => {
        if (tempRaw.length === 0) return; // Nothing new to update

        set((state) => {
          // Combine old state with the new batched data
          let nextRaw = state.rawBuffer.concat(tempRaw);
          let nextDecoded = state.decodedBuffer.concat(tempDecoded);

          // Prevent memory leaks by capping the array size
          if (nextRaw.length > MAX_BUFFER_SIZE) {
            nextRaw = nextRaw.slice(nextRaw.length - MAX_BUFFER_SIZE);
          }
          if (nextDecoded.length > MAX_BUFFER_SIZE) {
            nextDecoded = nextDecoded.slice(nextDecoded.length - MAX_BUFFER_SIZE);
          }

          // Clear the temporary buffers for the next batch
          tempRaw = [];
          tempDecoded = [];

          return {
            rawBuffer: nextRaw,
            decodedBuffer: nextDecoded,
            currentData: latestData
          };
        });
      }, 100); // 100ms batch timer (10 FPS for the UI charts)
    }
  },

  clearBuffer: () => {
    // Reset both the hidden buffers and the React state
    tempRaw = [];
    tempDecoded = [];
    set({ rawBuffer: [], decodedBuffer: [], currentData: null });
  },
  
  setStatus: (connected) => set({ isConnected: connected }),
}));