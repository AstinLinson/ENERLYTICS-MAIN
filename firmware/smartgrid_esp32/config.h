// =============================================
//  Smart Grid ESP32 — Configuration
// =============================================
#pragma once

// WiFi Credentials
#define WIFI_SSID       "Sebas"
#define WIFI_PASSWORD   "1234seba"

// Backend Server (LAN Deployment - MAXIMUM STABILITY)
// ESP32 sends data to your Laptop, and your Laptop beams it to Vercel via Cloudflare!
#define SERVER_HOST     "192.168.29.168"
#define SERVER_PORT     3000
#define SERVER_ENDPOINT "/smartgrid-data"

// MQTT Broker (same machine as server)
#define MQTT_BROKER     "192.168.29.168"    // ← Same IP as SERVER_HOST
#define MQTT_PORT       1883
#define MQTT_CLIENT_ID  "esp32_smartgrid"
#define MQTT_PUB_TOPIC  "smartgrid/data"
#define MQTT_SUB_TOPIC  "smartgrid/relay"

// GPIO Pin Assignments
#define VOLTAGE_SENSOR_PIN  34   // ADC1 CH6 — Voltage divider output
#define CURRENT_SENSOR_PIN  35   // ADC1 CH7 — ACS712 output
#define TEMP_SENSOR_PIN     32   // ADC1 CH4 — NTC thermistor or DS18B20 data
#define RELAY_PIN           26   // GPIO26   — Controls relay module

// Sensor Calibration
#define VOLTAGE_SCALE       7.48f   // 12V system: actual(12V) / vADC(1.604V) = 7.48
#define CURRENT_OFFSET      3103    // ACS712 zero-current midpoint (2.5V at 5V supply → 3103 in 12-bit ADC)
#define CURRENT_SCALE       0.066f  // ACS712 30A sensitivity (V/A)
#define VREF                3.3f    // ESP32 ADC reference voltage
#define ADC_RESOLUTION      4096.0f

// Thresholds (must match ai_engine.js)
#define TEMP_MAX            45.0f   // °C — overtemp
#define VOLTAGE_MIN         10.5f   // V  — low battery
#define VOLTAGE_MAX         14.5f   // V  — overvoltage
#define POWER_LIMIT         50.0f   // W  — overload (12V system)

// Timing
#define READ_INTERVAL_MS    5000    // Send data every 5 seconds
