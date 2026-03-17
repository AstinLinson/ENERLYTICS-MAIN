# ⚡ Smart Grid Energy Monitoring & Control System

> **SIH 2025 Project** — IoT + Automation + AI + Real-time Dashboard

## Architecture

```
ESP32 Sensors
    │  (HTTP POST every 5s + MQTT publish)
    ▼
Backend Server (Node.js + Express)
    │  (REST API + WebSocket + MQTT client)
    ▼
AI Decision Engine
    │  Layer 1: Rule-based safety overrides
    │  Layer 2: Q-Learning energy optimization
    ▼
Relay Control     ←→     Web Dashboard
(MQTT publish)         (WebSocket live updates)
```

## Project Structure

```
gag/
├── firmware/
│   ├── config.h               # WiFi, MQTT, pins, thresholds
│   └── smartgrid_esp32.ino    # Main ESP32 Arduino sketch
│
├── backend/
│   ├── server.js              # Express REST API + WebSocket
│   ├── db.js                  # SQLite database layer
│   ├── ai_engine.js           # Rule-based + Q-Learning AI
│   └── package.json
│
├── dashboard/
│   ├── index.html             # Dashboard layout
│   ├── style.css              # Dark glassmorphism theme
│   └── app.js                 # Live charts, relay control, alerts
│
└── README.md
```

## Quick Start

### 1. Dashboard Only (No ESP32 needed)
Just open `dashboard/index.html` in your browser.
It auto-runs in **simulation mode** with live animated data.

### 2. Full Backend
```bash
cd backend
npm install
node server.js          # Starts on http://localhost:3000
```
Then open `dashboard/index.html` — it connects automatically.

### 3. Test with curl
```bash
# Send simulated sensor data
curl -X POST http://localhost:3000/smartgrid-data \
  -H "Content-Type: application/json" \
  -d '{"voltage":205,"current":3.2,"temperature":46}'

# Manual relay control
curl -X POST http://localhost:3000/api/relay \
  -H "Content-Type: application/json" \
  -d '{"relay":"OFF"}'

# Get latest reading
curl http://localhost:3000/api/latest

# Get AI decisions
curl http://localhost:3000/api/decisions
```

## ESP32 Wiring

| Sensor | ESP32 Pin | Notes |
|---|---|---|
| Voltage sensor | GPIO34 (ADC1 CH6) | R1=100kΩ, R2=10kΩ divider |
| ACS712 current | GPIO35 (ADC1 CH7) | Zero = 2.5V, sensitivity 66mV/A |
| Temperature (NTC) | GPIO32 (ADC1 CH4) | 10kΩ thermistor + 10kΩ pull-up |
| Relay module | GPIO26 | Active HIGH |

## Required Arduino Libraries

Install via Arduino Library Manager:
- `PubSubClient` — MQTT client
- `ArduinoJson` — JSON serialization
- `ESP32` board support (espressif/arduino-esp32)

## AI Decision Logic

### Layer 1 — Rule-Based (Safety)
| Condition | Action |
|---|---|
| Temperature > 45°C | Relay OFF immediately |
| Voltage < 210V | Relay OFF + battery alert |
| Voltage > 250V | Protective disconnect |
| Power > 2000W | Load shedding |

### Layer 2 — Q-Learning (Optimization)
- **State**: (voltage zone) × (load level) × (temperature zone)
- **Actions**: relay_off, relay_on, reduce_load, hold
- **Reward**: +1.5 for energy saving, -3 for unsafe state
- **Exploration**: ε-greedy with decay (ε: 0.2 → 0.05)

## Dashboard Features
- 📊 Live voltage / current / temperature charts (ApexCharts)
- 🔌 Relay ON/OFF controls (4 relays)
- 🤖 AI Decision Log (rule-based + RL decisions)
- 🔔 Tamil regional alerts with voice synthesis
- 📈 Session statistics (peak power, avg voltage, uptime)
- 🌐 Auto-reconnecting WebSocket

## MQTT Topics

| Topic | Direction | Payload |
|---|---|---|
| `smartgrid/data` | ESP32 → Server | `{voltage, current, temperature, power}` |
| `smartgrid/relay` | Server → ESP32 | `{relay: "ON"\|"OFF"}` |

## Regional Alert Messages (Tamil)

| Event | Tamil | English |
|---|---|---|
| Overload | அதிக மின்சாரம் பயன்படுத்தப்படுகிறது | High power consumption |
| Overtemperature | அதிக வெப்பநிலை | High battery temperature |
| Low voltage | குறைந்த மின்னழுத்தம் | Low grid voltage |
| Overvoltage | அதிக மின்னழுத்தம் | Voltage spike detected |
