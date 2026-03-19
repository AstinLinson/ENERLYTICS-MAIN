// =============================================
//  Smart Grid ESP32 — Configuration
// =============================================
#pragma once

// WiFi Credentials
#define WIFI_SSID       "YOUR_WIFI_SSID"      // ← Replace with your WiFi name
#define WIFI_PASSWORD   "YOUR_WIFI_PASSWORD"  // ← Replace with your WiFi password

// Backend Server
// If local: use your PC's IP (e.g., "192.168.1.5") and Port 3000
// If cloud: use your Render domain (e.g., "my-api.onrender.com") and Port 80
#define SERVER_HOST     "YOUR_RENDER_URL_OR_LOCAL_IP" // ← DO NOT include http://
#define SERVER_PORT     80                            // ← 80 for Render cloud, 3000 for local PC
#define SERVER_ENDPOINT "/smartgrid-data"

// MQTT Broker (same machine as server)
#define MQTT_BROKER     "192.168.29.140"    // ← Same IP as SERVER_HOST
#define MQTT_PORT       1883
#define MQTT_CLIENT_ID  "esp32_smartgrid"
#define MQTT_PUB_TOPIC  "smartgrid/data"
#define MQTT_SUB_TOPIC  "smartgrid/relay"

// GPIO Pin Assignments
#define VOLTAGE_SENSOR_PIN  34   // ADC1 CH6 — Voltage divider output
#define CURRENT_SENSOR_PIN  35   // ADC1 CH7 — ACS712 output
#define TEMP_SENSOR_PIN     32   // ADC1 CH4 — NTC thermistor or DS18B20 data
#define RELAY_PIN           26   // GPIO26   — Controls relay module

// Sensor Calibration — 12V DC System
// Voltage divider: R1=30kΩ, R2=10kΩ → 12V maps to ~3V at ADC pin
#define VOLTAGE_SCALE       0.48f   // Calibrated: 4.0 × (12V actual / 100V shown) = 0.48
#define CURRENT_OFFSET      2048    // ACS712 zero-current midpoint (12-bit ADC)
#define CURRENT_SCALE       0.185f  // ACS712 5A module  (0.1 for 20A, 0.066 for 30A)
#define VREF                3.3f    // ESP32 ADC reference voltage
#define ADC_RESOLUTION      4096.0f

// Safety Thresholds — 12V DC System
#define TEMP_MAX            45.0f   // °C — motor/battery overtemp
#define VOLTAGE_MIN         10.5f   // V  — low battery warning
#define VOLTAGE_MAX         14.5f   // V  — overvoltage (charging limit)
#define POWER_LIMIT         50.0f   // W  — overload (12V × ~4A)

// Timing
#define READ_INTERVAL_MS    5000    // Send data every 5 seconds
