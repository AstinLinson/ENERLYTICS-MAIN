import { useState, useEffect } from 'react';

// Use your LAN IP while developing on Expo Go
// Replace with your Cloudflare Tunnel URL when deploying remotely
const BACKEND_WS = process.env.EXPO_PUBLIC_WS_URL || 'ws://192.168.29.140:3000';

export interface GridData {
  voltage: number;
  current: number;
  temperature: number;
  power: number;
}

export interface Prediction {
  predictedV: number;
  predictedI: number;
  predictedT: number;
  anomalyScore: number;
}

export interface Healing {
  epsilon: number;
  action: string | null;
}

export function useGridData() {
  const [data, setData] = useState<GridData | null>(null);
  const [prediction, setPrediction] = useState<Prediction | null>(null);
  const [healing, setHealing] = useState<Healing | null>(null);
  const [activeAlert, setActiveAlert] = useState<any>(null);
  const [alertsHistory, setAlertsHistory] = useState<any[]>([]);

  useEffect(() => {
    let ws: WebSocket;
    
    function connect() {
      ws = new WebSocket(BACKEND_WS);

      ws.onopen = () => console.log('[WS] Connected to ' + BACKEND_WS);
      ws.onclose = () => {
        console.log('[WS] Disconnected, retrying in 5s...');
        setTimeout(connect, 5000);
      };

      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          
          if (msg.type === 'sensor_update' || msg.type === 'initial') {
            if (msg.data) {
              setData({ ...msg.data, power: typeof msg.data.power === 'number' ? msg.data.power : msg.data.voltage * msg.data.current });
            }
            if (msg.prediction) setPrediction(msg.prediction);
            if (msg.healing) setHealing(msg.healing);
            
            // Handle transient alerts inside the update stream
            if (msg.alerts && msg.alerts.length > 0) {
              const newAlert = msg.alerts[0];
              setActiveAlert(newAlert);
              setAlertsHistory(prev => [newAlert, ...prev].slice(0, 50)); // keep last 50
              
              // Clear banner after 5s
              setTimeout(() => setActiveAlert(null), 5000);
            }
            
            // Handle fault from classifier
            if (msg.fault && msg.fault.severity !== 'NORMAL') {
                const faultAlert = { message: `[${msg.fault.severity}] ${msg.fault.type}: ${msg.fault.message}`, priority: msg.fault.severity === 'CRITICAL' ? 'critical' : 'warning'};
                setActiveAlert(faultAlert);
                setAlertsHistory(prev => [faultAlert, ...prev].slice(0, 50));
                setTimeout(() => setActiveAlert(null), 5000);
            }
          }
        } catch (err) {
          console.error('[WS] Parse error', err);
        }
      };
    }

    connect();

    return () => {
      ws?.close();
    };
  }, []);

  return { data, prediction, healing, activeAlert, alertsHistory };
}
