import { create } from 'zustand';

// Define the structure of a single telemetry point (example)
type TelemetryPoint = {
  timestamp: number;
  speed: number;
  rpm: number;
  throttle: number;
  // Add other metrics as needed
};

interface MqttState {
  isConnected: boolean;
  isRecording: boolean;
  dataBuffer: TelemetryPoint[];
  currentData: TelemetryPoint | null;
  connectStatus: 'disconnected' | 'connecting' | 'connected' | 'error';
  
  // Actions
  addPoint: (point: TelemetryPoint) => void;
  clearBuffer: () => void;
  setStatus: (status: MqttState['connectStatus']) => void;
  setIsRecording: (recording: boolean) => void;
}

export const useMqttStore = create<MqttState>((set) => ({
  isConnected: false,
  isRecording: false,
  dataBuffer: [],
  currentData: null,
  connectStatus: 'disconnected',

  addPoint: (point) => set((state) => ({
    dataBuffer: state.isRecording ? [...state.dataBuffer, point] : state.dataBuffer,
    currentData: point, // Update the display data immediately
  })),

  clearBuffer: () => set({ dataBuffer: [] }),
  
  setStatus: (status) => set({ 
    connectStatus: status, 
    isConnected: status === 'connected' 
  }),

  setIsRecording: (recording) => set({ isRecording: recording }),
}));