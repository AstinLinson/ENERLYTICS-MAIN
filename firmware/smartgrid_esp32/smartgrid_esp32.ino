// =============================================
//  Smart Grid ESP32 Firmware
//  Reads: Voltage | Current | Temperature
//  Sends: HTTP POST to backend server
//  Receives: MQTT relay commands
// =============================================

#include <WiFi.h>
#include <HTTPClient.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include "config.h"

// --- Global Clients ---
WiFiClient       wifiClient;
PubSubClient     mqttClient(wifiClient);
HTTPClient       httpClient;

unsigned long lastSendTime = 0;
bool relayState = false;

// =============================================
//  SENSOR READING FUNCTIONS
// =============================================

float readVoltage() {
  int raw = analogRead(VOLTAGE_SENSOR_PIN);
  // Voltage divider: R1=100kΩ, R2=10kΩ — scales 0–250V to 0–3.3V
  float vADC = (raw / ADC_RESOLUTION) * VREF;
  return vADC * VOLTAGE_SCALE;
}

float readCurrent() {
  // ACS712 — reads centered at ~2.5V for 0A
  int raw = analogRead(CURRENT_SENSOR_PIN);
  float vADC = (raw / ADC_RESOLUTION) * VREF;
  float vOffset = (CURRENT_OFFSET / ADC_RESOLUTION) * VREF;
  return (vADC - vOffset) / CURRENT_SCALE;
}

float readTemperature() {
  // NTC Thermistor (10kΩ B=3950) or DS18B20 via single-wire
  // Simplified NTC formula for demo:
  int raw = analogRead(TEMP_SENSOR_PIN);
  float resistance = (ADC_RESOLUTION / raw - 1.0f) * 10000.0f;
  float steinhart = log(resistance / 10000.0f) / 3950.0f;
  steinhart += 1.0f / (25.0f + 273.15f);
  float tempK = 1.0f / steinhart;
  return tempK - 273.15f;
}

// =============================================
//  RELAY CONTROL
// =============================================

void setRelay(bool on) {
  relayState = on;
  digitalWrite(RELAY_PIN, on ? HIGH : LOW);
  Serial.printf("[RELAY] %s\n", on ? "ON" : "OFF");
}

// =============================================
//  MQTT CALLBACK — Receives commands from server
// =============================================

void mqttCallback(char* topic, byte* payload, unsigned int length) {
  String message = "";
  for (unsigned int i = 0; i < length; i++) {
    message += (char)payload[i];
  }
  Serial.printf("[MQTT] Received on %s: %s\n", topic, message.c_str());

  // Parse command
  StaticJsonDocument<128> doc;
  DeserializationError err = deserializeJson(doc, message);
  if (!err) {
    const char* cmd = doc["relay"];
    if (cmd) {
      if (strcmp(cmd, "ON") == 0)  setRelay(true);
      if (strcmp(cmd, "OFF") == 0) setRelay(false);
    }
  }
}

// =============================================
//  WIFI CONNECTION
// =============================================

void connectWiFi() {
  Serial.printf("\n[WiFi] Connecting to %s", WIFI_SSID);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.printf("\n[WiFi] Connected! IP: %s\n", WiFi.localIP().toString().c_str());
}

// =============================================
//  MQTT CONNECTION — non-blocking, optional
// =============================================

void connectMQTT() {
  mqttClient.setServer(MQTT_BROKER, MQTT_PORT);
  mqttClient.setCallback(mqttCallback);
  // Single attempt only — MQTT is optional, HTTP POST is the primary path
  Serial.print("[MQTT] Connecting (optional)...");
  if (mqttClient.connect(MQTT_CLIENT_ID)) {
    Serial.println(" Connected!");
    mqttClient.subscribe(MQTT_SUB_TOPIC);
    Serial.printf("[MQTT] Subscribed to %s\n", MQTT_SUB_TOPIC);
  } else {
    Serial.printf(" Not available (rc=%d) — HTTP-only mode\n", mqttClient.state());
  }
}

// =============================================
//  HTTP POST — Send sensor data to backend
// =============================================

void sendDataHTTP(float voltage, float current, float temperature) {
  if (WiFi.status() != WL_CONNECTED) return;

  float power = voltage * current;

  StaticJsonDocument<256> doc;
  doc["voltage"]     = round(voltage * 10) / 10.0;
  doc["current"]     = round(current * 100) / 100.0;
  doc["temperature"] = round(temperature * 10) / 10.0;
  doc["power"]       = round(power * 10) / 10.0;
  doc["relay"]       = relayState ? "ON" : "OFF";
  doc["deviceId"]    = MQTT_CLIENT_ID;

  String payload;
  serializeJson(doc, payload);

  String protocol = SERVER_PORT == 443 ? "https://" : "http://";
  String portStr = (SERVER_PORT == 80 || SERVER_PORT == 443) ? "" : String(":") + SERVER_PORT;
  String url = protocol + SERVER_HOST + portStr + SERVER_ENDPOINT;
  
  httpClient.setFollowRedirects(HTTPC_STRICT_FOLLOW_REDIRECTS);
  httpClient.begin(url);
  httpClient.addHeader("Content-Type", "application/json");

  int httpCode = httpClient.POST(payload);
  if (httpCode > 0) {
    Serial.printf("[HTTP] POST %d — %s\n", httpCode, httpClient.getString().c_str());
  } else {
    Serial.printf("[HTTP] Error: %s\n", httpClient.errorToString(httpCode).c_str());
  }
  httpClient.end();
}

// =============================================
//  SETUP
// =============================================

void setup() {
  Serial.begin(115200);
  delay(100);

  pinMode(RELAY_PIN, OUTPUT);
  setRelay(false); // Start with relay OFF

  connectWiFi();
  connectMQTT();

  Serial.println("[Smart Grid] ESP32 ready!");
}

// =============================================
//  LOOP
// =============================================

void loop() {
  // Keep MQTT alive
  if (!mqttClient.connected()) connectMQTT();
  mqttClient.loop();

  // Send sensor data on interval
  unsigned long now = millis();
  if (now - lastSendTime >= READ_INTERVAL_MS) {
    lastSendTime = now;

    float v = readVoltage();
    float i = readCurrent();
    float t = readTemperature();

    Serial.printf("[SENSORS] V=%.1fV | I=%.2fA | T=%.1f°C | P=%.1fW\n",
                  v, i, v * i, t);

    // Send via HTTP POST
    sendDataHTTP(v, i, t);

    // Also publish to MQTT for other subscribers
    StaticJsonDocument<256> pub;
    pub["voltage"]     = v;
    pub["current"]     = i;
    pub["temperature"] = t;
    pub["power"]       = v * i;
    String mqttPayload;
    serializeJson(pub, mqttPayload);
    mqttClient.publish(MQTT_PUB_TOPIC, mqttPayload.c_str());
  }
}
