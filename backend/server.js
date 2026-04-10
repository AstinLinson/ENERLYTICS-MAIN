// =============================================
//  Smart Grid — Main Backend Server
//  Express REST API + WebSocket + MQTT Client
// =============================================
require('dotenv').config({ path: __dirname + '/.env' });

const express  = require('express');
const cors     = require('cors');
const http     = require('http');
const WebSocket = require('ws');
const mqtt     = require('mqtt');
const { initDB, saveReading, getLatestReading, getHistory, logRelayEvent, getRecentDecisions } = require('./db');
const { makeDecision, THRESHOLDS } = require('./ai_engine');

const PORT = process.env.PORT || 3000;
const MQTT_BROKER = process.env.MQTT_BROKER || 'mqtt://localhost:1883';

// =============================================
//  ASYNC STARTUP — sql.js initDB is async
// =============================================
(async () => {
await initDB();

const app    = express();
const server = http.createServer(app);
const wss    = new WebSocket.Server({ server });

// =============================================
//  MIDDLEWARE
// =============================================
app.use(cors());
app.use(express.json());
const path = require('path');
app.use(express.static(path.join(__dirname, '../dashboard')));   // Serve dashboard from http://localhost:3000


// =============================================
//  MQTT CLIENT
// =============================================
let mqttClient = null;
let mqttConnected = false;

try {
  mqttClient = mqtt.connect(MQTT_BROKER, { reconnectPeriod: 5000 });

  mqttClient.on('connect', () => {
    mqttConnected = true;
    console.log(`[MQTT] Connected to ${MQTT_BROKER}`);
    mqttClient.subscribe('smartgrid/data', (err) => {
      if (!err) console.log('[MQTT] Subscribed to smartgrid/data');
    });
  });

  mqttClient.on('message', async (topic, payload) => {
    try {
      const data = JSON.parse(payload.toString());
      await handleSensorData(data, 'mqtt');
    } catch (e) {
      console.error('[MQTT] Parse error:', e.message);
    }
  });

  mqttClient.on('error', (err) => {
    console.warn('[MQTT] Connection error (MQTT optional):', err.message);
    mqttConnected = false;
  });
} catch (e) {
  console.warn('[MQTT] MQTT broker not available — running in HTTP-only mode');
}

function publishRelay(command, reason = '') {
  if (mqttClient && mqttConnected) {
    const payload = JSON.stringify({ relay: command, timestamp: new Date().toISOString() });
    mqttClient.publish('smartgrid/relay', payload, (err) => {
      if (!err) console.log(`[MQTT] Published relay command: ${command}`);
    });
  }
  logRelayEvent(command, 'ai_engine', reason);
}

// =============================================
//  CORE DATA HANDLER
//  Called from both HTTP POST and MQTT
// =============================================
async function handleSensorData(data, source = 'http') {
  // Compute power if not provided
  if (!data.power) data.power = data.voltage * data.current;

  // Save to DB
  saveReading(data);
  console.log(`[${source.toUpperCase()}] V=${data.voltage}V I=${data.current}A T=${data.temperature}°C P=${data.power.toFixed(1)}W`);

  // Run AI decisions
  const { decisions, lstmPrediction, dqnStatus, fault } = await makeDecision(data);

  // Execute any relay commands decided by AI
  for (const dec of decisions) {
    if (dec.command && dec.command.relay) {
      publishRelay(dec.command.relay, dec.reason);
      console.log(`[AI] ${dec.layer} → ${dec.action}: ${dec.reason}`);
    }
  }

  // Get last stored alerts info for broadcast
  const alerts = decisions.filter(d => d.priority === 'critical' || d.priority === 'high');

  // Broadcast to all WebSocket clients
  const broadcast = {
    type: 'sensor_update',
    data: {
      ...data,
      timestamp: new Date().toISOString(),
      power: data.power
    },
    decisions: decisions.map(d => ({ action: d.action, reason: d.reason, priority: d.priority, layer: d.layer })),
    alerts: alerts.map(a => ({ message: a.reason, priority: a.priority })),
    thresholds: THRESHOLDS,
    prediction: lstmPrediction,
    healing: dqnStatus,
    fault: fault ? { type: fault.faultType, severity: fault.severity, message: fault.message } : null
  };

  const msg = JSON.stringify(broadcast);
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(msg);
    }
  });

  return { decisions, alerts };
}

// =============================================
//  REST API ROUTES
// =============================================

// Health check
app.get('/', (req, res) => {
  res.json({
    status: 'Smart Grid Backend Running',
    mqtt: mqttConnected ? 'connected' : 'disconnected',
    time: new Date().toISOString()
  });
});

// --- Receive sensor data from ESP32 ---
app.post('/smartgrid-data', async (req, res) => {
  const { voltage, current, temperature, relay, deviceId } = req.body;

  if (voltage == null || current == null || temperature == null) {
    return res.status(400).json({ error: 'Missing required fields: voltage, current, temperature' });
  }

  const data = { voltage: +voltage, current: +current, temperature: +temperature, relay, deviceId };
  const { decisions, alerts } = await handleSensorData(data, 'http');

  res.json({
    success: true,
    decisions: decisions.map(d => ({ action: d.action, reason: d.reason })),
    alerts: alerts.length > 0 ? alerts.map(a => a.message) : []
  });
});

// --- Get latest reading ---
app.get('/api/latest', (req, res) => {
  const reading = getLatestReading();
  res.json(reading || { message: 'No data yet' });
});

// --- Get history ---
app.get('/api/history', (req, res) => {
  const limit = parseInt(req.query.limit) || 100;
  res.json(getHistory(limit));
});

// --- Manual relay control ---
// --- Settings API Endpoint ---
app.post('/api/settings', (req, res) => {
  const { powerLimit } = req.body;
  if (powerLimit != null) {
    THRESHOLDS.POWER_LIMIT = Number(powerLimit);
    console.log(`[SETTINGS] Power Limit updated to: ${THRESHOLDS.POWER_LIMIT}W`);
    
    // Broadcast updated thresholds to all clients immediately
    const broadcast = {
      type: 'initial',
      data: { voltage: 0, current: 0, temperature: 0, power: 0 }, // Dummy data, UI just uses it if it wants, but we mainly want THRESHOLDS
      thresholds: THRESHOLDS
    };
    wss.clients.forEach(c => {
      if (c.readyState === WebSocket.OPEN) {
        c.send(JSON.stringify(broadcast));
      }
    });

    return res.json({ success: true, newLimit: THRESHOLDS.POWER_LIMIT });
  }
  return res.status(400).json({ error: 'Invalid settings payload.' });
});

app.post('/api/relay', (req, res) => {
  const { relay } = req.body;
  if (!relay || !['ON', 'OFF'].includes(relay.toUpperCase())) {
    return res.status(400).json({ error: 'relay must be "ON" or "OFF"' });
  }
  const cmd = relay.toUpperCase();
  publishRelay(cmd, 'Manual API call');
  res.json({ success: true, relay: cmd, mqtt: mqttConnected });
});

// --- Get AI decisions log ---
app.get('/api/decisions', (req, res) => {
  res.json(getRecentDecisions(20));
});

// --- Get thresholds ---
app.get('/api/thresholds', (req, res) => {
  res.json(THRESHOLDS);
});

// =============================================
//  WEBSOCKET
// =============================================
wss.on('connection', (ws, req) => {
  console.log(`[WS] Client connected from ${req.socket.remoteAddress}`);

  // Send latest data immediately on connect
  const latest = getLatestReading();
  if (latest) {
    ws.send(JSON.stringify({ type: 'initial', data: latest }));
  }

  ws.on('message', (msg) => {
    try {
      const cmd = JSON.parse(msg);
      if (cmd.type === 'relay_command') {
        publishRelay(cmd.relay, 'WebSocket dashboard command');
        ws.send(JSON.stringify({ type: 'ack', relay: cmd.relay }));
      }
    } catch (e) {
      console.warn('[WS] Bad message:', e.message);
    }
  });

  ws.on('close', () => console.log('[WS] Client disconnected'));
});

// =============================================
//  START SERVER
// =============================================
server.listen(PORT, () => {
  console.log(`\n╔════════════════════════════════════════╗`);
  console.log(`║   Smart Grid Backend Server            ║`);
  console.log(`║   HTTP  → http://localhost:${PORT}        ║`);
  console.log(`║   WS    → ws://localhost:${PORT}          ║`);
  console.log(`║   MQTT  → ${MQTT_BROKER}  ║`);
  console.log(`╚════════════════════════════════════════╝\n`);
  console.log('[Server] Ready to receive ESP32 data!');
  console.log(`[Server] Dashboard → http://localhost:${PORT}`);
  console.log(`[Server] Dashboard → http://192.168.29.140:${PORT}  (LAN access)`);
});

})(); // end async IIFE
