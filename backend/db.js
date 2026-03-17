// =============================================
//  Smart Grid — SQLite Database Layer
//  Using sql.js (pure JS, no native build needed)
// =============================================
const initSqlJs = require('sql.js');
const path = require('path');
const fs   = require('fs');

const DB_PATH = path.join(__dirname, 'smartgrid.db');

let db = null;

// =============================================
//  PERSIST: save DB to disk after every write
// =============================================
function persist() {
  const data = db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
}

// =============================================
//  INIT — Load or create DB
// =============================================
async function initDB() {
  const SQL = await initSqlJs();

  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(fileBuffer);
    console.log('[DB] Loaded existing SQLite DB from', DB_PATH);
  } else {
    db = new SQL.Database();
    console.log('[DB] Created new SQLite DB at', DB_PATH);
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS sensor_readings (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp   TEXT    NOT NULL DEFAULT (datetime('now')),
      voltage     REAL    NOT NULL,
      current     REAL    NOT NULL,
      temperature REAL    NOT NULL,
      power       REAL    NOT NULL,
      relay       TEXT    NOT NULL DEFAULT 'OFF',
      device_id   TEXT    NOT NULL DEFAULT 'esp32_smartgrid'
    );

    CREATE TABLE IF NOT EXISTS relay_events (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp   TEXT    NOT NULL DEFAULT (datetime('now')),
      command     TEXT    NOT NULL,
      source      TEXT    NOT NULL DEFAULT 'api',
      reason      TEXT
    );

    CREATE TABLE IF NOT EXISTS ai_decisions (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp   TEXT    NOT NULL DEFAULT (datetime('now')),
      state       TEXT    NOT NULL,
      action      TEXT    NOT NULL,
      reason      TEXT    NOT NULL,
      reward      REAL
    );
  `);
  persist();
}

// =============================================
//  HELPERS
// =============================================
function run(sql, params = []) {
  db.run(sql, params);
  persist();
}

function query(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

function queryOne(sql, params = []) {
  return query(sql, params)[0] || null;
}

// =============================================
//  SENSOR READINGS
// =============================================
function saveReading(data) {
  run(
    `INSERT INTO sensor_readings (voltage, current, temperature, power, relay, device_id)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [data.voltage, data.current, data.temperature,
     data.power || (data.voltage * data.current),
     data.relay || 'OFF',
     data.deviceId || 'esp32_smartgrid']
  );
}

function getLatestReading() {
  return queryOne('SELECT * FROM sensor_readings ORDER BY id DESC LIMIT 1');
}

function getHistory(limit = 100) {
  return query('SELECT * FROM sensor_readings ORDER BY id DESC LIMIT ?', [limit]);
}

// =============================================
//  RELAY EVENTS
// =============================================
function logRelayEvent(command, source = 'api', reason = '') {
  run('INSERT INTO relay_events (command, source, reason) VALUES (?, ?, ?)',
      [command, source, reason || '']);
}

// =============================================
//  AI DECISIONS
// =============================================
function logDecision(state, action, reason, reward = null) {
  run('INSERT INTO ai_decisions (state, action, reason, reward) VALUES (?, ?, ?, ?)',
      [JSON.stringify(state), action, reason, reward]);
}

function getRecentDecisions(limit = 20) {
  return query('SELECT * FROM ai_decisions ORDER BY id DESC LIMIT ?', [limit]);
}

module.exports = { initDB, saveReading, getLatestReading, getHistory, logRelayEvent, logDecision, getRecentDecisions };
