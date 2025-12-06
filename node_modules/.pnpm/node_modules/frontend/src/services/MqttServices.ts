import mqtt from 'mqtt';
import { useMqttStore } from '../store/MqttStore';
import { Decoder } from './CANDecoder';

export const MqttService = {
  client: null as mqtt.MqttClient | null,

  connect: (config: any) => {
    if (MqttService.client?.connected) return;

    console.log(`Connecting to ${config.broker}...`);
    MqttService.client = mqtt.connect(config.broker);

    MqttService.client.on('connect', () => {
      console.log('MQTT Connected');
      useMqttStore.getState().setStatus(true);
      MqttService.client?.subscribe(config.topic);
    });

    MqttService.client.on('message', (topic, payload) => {
      if (topic === config.topic) {
        const rawString = payload.toString(); // "1234,0x401,AABB"
        
        // 1. Decode It
        const decodedObject = Decoder.parse(rawString);

        // 2. Store Both
        useMqttStore.getState().addMessage(rawString, decodedObject);
      }
    });

    MqttService.client.on('error', (err) => {
      console.error("MQTT Error", err);
      useMqttStore.getState().setStatus(false);
    });
    
    MqttService.client.on('close', () => {
        useMqttStore.getState().setStatus(false);
    });
  },

  disconnect: () => {
    if (MqttService.client) {
      MqttService.client.end();
    }
  }
};