import mqtt from 'mqtt';
import { useMqttStore } from '../store/MqttStore';
import { MqttAuth } from '@telemetry/shared';

export const MqttService = {
  client: null as mqtt.MqttClient | null,

  connect: (connectionParam:MqttAuth) => {
    if (MqttService.client && MqttService.client.connected) {
      console.warn("Client already connected.");
      return;
    }

    useMqttStore.getState().setStatus('connecting');
    const BROKER_URL = `wss://${connectionParam.broker}:8884/mqtt`;
    const TELEMETRY_TOPIC = connectionParam.topic;
    
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

    MqttService.client.on('message', (topic, message) => {
    const messageStr = message.toString();

    if(topic===TELEMETRY_TOPIC){
      try {
          const parts = messageStr.split(',');
          
          if (parts.length >= 3) {
              const payload = {
                  timestamp: parseFloat(parts[0]),
                  canId: parts[1],
                  data: parts[2]
              };

              // Now send this 'payload' object to your state store or update function
              // Example: useTelemetryStore.getState().updateData(payload);
              console.log("Parsed Data:", payload); 
          }
      } catch (error) {
          console.error("Error parsing manual payload:", error);
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