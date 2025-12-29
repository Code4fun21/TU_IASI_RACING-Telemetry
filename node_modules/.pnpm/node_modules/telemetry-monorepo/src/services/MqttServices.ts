import mqtt from 'mqtt';
import { useMqttStore } from '../store/MqttStore';
import { CANDecoder } from './CANDecoder'; // 1. Import Class
import { Track } from '@telemetry/shared';

// Create a single instance for live decoding

const decoder = new CANDecoder();
export const MqttService = {
  client: null as mqtt.MqttClient | null,

  
  setTrack: (trackData:Track) => {
    console.log("Setting Track Gates for Decoder...",trackData);
    decoder.setBaseCoordinates(trackData);
  },

  connect: (config: { broker: string; port: number; topic: string }) => {
    
    if (MqttService.client?.connected) {
        console.warn("MQTT Client already connected.");
        return;
    }

    // 1. Construct WebSocket URL
    let brokerUrl = config.broker;
    if (!brokerUrl.startsWith('ws://') && !brokerUrl.startsWith('wss://')) {
        const protocol = (config.port === 8884 || config.port === 443) ? 'wss' : 'ws';
        brokerUrl = `${protocol}://${brokerUrl}`;
    }

    const urlHasPort = /:\d+/.test(brokerUrl);
    if (!urlHasPort) {
        brokerUrl = `${brokerUrl}:${config.port}`;
    }

    if (!brokerUrl.includes('/mqtt') && brokerUrl.includes('hivemq')) {
        brokerUrl = `${brokerUrl}/mqtt`;
    }

    console.log(`Attempting connection to: ${brokerUrl}`);
    useMqttStore.getState().setStatus(false);

    // 2. Connect
    try {
        MqttService.client = mqtt.connect(brokerUrl, {
            reconnectPeriod: 2000,
            clean: true,
            // FIX: Use slice(2, 10) instead of substr(2, 8)
            clientId: 'telemetry_client_' + Math.random().toString(16).slice(2, 10),
            path: '/mqtt', 
        });

        // 3. Event Handlers
        MqttService.client.on('connect', () => {
            console.log('✅ MQTT Connected');
            useMqttStore.getState().setStatus(true);
            
            MqttService.client?.subscribe(config.topic, (err) => {
                if (err) console.error("Subscription error:", err);
                else console.log(`📡 Subscribed to: ${config.topic}`);
            });
        });

        MqttService.client.on('message', (topic, payload) => {
            if (topic === config.topic) {
                try {
                    const rawString = payload.toString(); 
                    
                    // FIX 2: Use the instance method .parse()
                    
                    const decodedObject = decoder.parse(rawString);
                    
                    // Only add if successfully decoded (not null)
                    // If you want to keep raw strings even if decode fails, remove the check.
                    // But usually, we want paired data.
                    useMqttStore.getState().addMessage(rawString, decodedObject);
                    
                } catch (e) {
                    console.error("Msg Error:", e);
                }
            }
        });

        MqttService.client.on('error', (err) => {
            console.error("❌ MQTT Error:", err);
            useMqttStore.getState().setStatus(false);
        });
        
        MqttService.client.on('offline', () => {
            console.warn("MQTT Offline");
            useMqttStore.getState().setStatus(false);
        });

    } catch (error) {
        console.error("Connection failed instantly:", error);
    }
  },

  disconnect: () => {
    if (MqttService.client) {
      console.log("Disconnecting MQTT...");
      MqttService.client.end();
      MqttService.client = null;
      useMqttStore.getState().setStatus(false);
    }
  }
};