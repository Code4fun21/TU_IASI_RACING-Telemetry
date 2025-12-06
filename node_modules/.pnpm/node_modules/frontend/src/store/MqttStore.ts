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

export const useMqttStore = create<MqttState>((set) => ({
  isConnected: false,
  rawBuffer: [],
  decodedBuffer: [],
  currentData: null,

  addMessage: (raw, decoded) => set((state) => ({
    rawBuffer: [...state.rawBuffer, raw],
    // Only add to decoded buffer if decoding was successful
    decodedBuffer: decoded ? [...state.decodedBuffer, decoded] : state.decodedBuffer,
    currentData: decoded || state.currentData,
  })),

  clearBuffer: () => set({ rawBuffer: [], decodedBuffer: [], currentData: null }),
  setStatus: (connected) => set({ isConnected: connected }),
}));