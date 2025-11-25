import mqtt from 'mqtt';
import { useMqttStore } from '../store/MqttStore';

const BROKER_URL = 'ws://your-mqtt-broker.com:8083/mqtt'; // MUST be a WebSocket URL!
const TELEMETRY_TOPIC = 'fs-car/telemetry/live';

export const MqttService = {
  client: null as mqtt.MqttClient | null,

  connect: () => {
    if (MqttService.client && MqttService.client.connected) {
      console.warn("Client already connected.");
      return;
    }

    useMqttStore.getState().setStatus('connecting');
    console.log(`Connecting to MQTT broker: ${BROKER_URL}`);
    
    // Create the MQTT client using WebSocket protocol
    MqttService.client = mqtt.connect(BROKER_URL);

    MqttService.client.on('connect', () => {
      console.log('MQTT Connected');
      useMqttStore.getState().setStatus('connected');
      
      // Subscribe to the live telemetry topic
      MqttService.client?.subscribe(TELEMETRY_TOPIC, (err) => {
        if (err) {
          console.error("Subscription error:", err);
          useMqttStore.getState().setStatus('error');
        } else {
          console.log(`Subscribed to topic: ${TELEMETRY_TOPIC}`);
        }
      });
    });

    MqttService.client.on('message', (topic, payload) => {
      if (topic === TELEMETRY_TOPIC) {
        try {
          // Assuming the car sends a JSON string
          const data = JSON.parse(payload.toString());

          // Map the raw data to your stored type (MqttStore.ts)
          const point = {
            timestamp: Date.now(), // Use local time for logging, or time from data
            speed: data.speed,
            rpm: data.rpm,
            throttle: data.throttle,
          };
          
          useMqttStore.getState().addPoint(point);

        } catch (e) {
          console.error("Failed to parse MQTT payload:", payload.toString());
        }
      }
    });

    MqttService.client.on('error', (error) => {
      console.error('MQTT Connection Error:', error);
      MqttService.client?.end();
      useMqttStore.getState().setStatus('error');
    });
  },

  disconnect: () => {
    if (MqttService.client) {
      MqttService.client.end(() => {
        useMqttStore.getState().setStatus('disconnected');
        console.log('MQTT Disconnected');
      });
    }
  },
};