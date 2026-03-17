// =============================================
//  Smart Grid ESP32 — Configuration
// =============================================
#pragma once

// WiFi Credentials
#define WIFI_SSID       "Sebas"
#define WIFI_PASSWORD   "1234seba"

// Backend Server  ← Your PC's LAN IP on WiFi "YOUR_WIFI_SSID"
#define SERVER_HOST     "192.168.29.140"    // ← Auto-detected PC IP. Update if it changes.
#define SERVER_PORT     3000
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

// Sensor Calibration
#define VOLTAGE_SCALE       110.0f  // Multiply ADC ratio to get real voltage (V)
#define CURRENT_OFFSET      2048    // ACS712 zero-current ADC reading (12-bit)
#define CURRENT_SCALE       0.066f  // ACS712 30A sensitivity (V/A)
#define VREF                3.3f    // ESP32 ADC reference voltage
#define ADC_RESOLUTION      4096.0f

// Thresholds (must match ai_engine.js)
#define TEMP_MAX            45.0f   // °C — above this → relay OFF
#define VOLTAGE_MIN         210.0f  // V  — below this → alert
#define VOLTAGE_MAX         250.0f  // V  — above this → alert
#define POWER_LIMIT         2000.0f // W  — above this → load shed

// Timing
#define READ_INTERVAL_MS    5000    // Send data every 5 seconds
