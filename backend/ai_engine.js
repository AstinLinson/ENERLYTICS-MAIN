// =============================================
//  Smart Grid — AI Decision Engine
//  Layer 1: Rule-Based (immediate safety)
//  Layer 2: Q-Learning (energy optimization)
// =============================================

const { logDecision } = require('./db');

// =============================================
//  THRESHOLDS (match config.h)
// =============================================
const THRESHOLDS = {
  TEMP_MAX:     45,    // °C
  TEMP_WARN:    40,    // °C
  VOLTAGE_MIN:  10.5,  // V  — low battery
  VOLTAGE_MAX:  14.5,  // V  — overvoltage
  POWER_LIMIT:  50,    // W  — overload for 12V system
  CURRENT_MAX:  4      // A
};

// =============================================
//  Q-LEARNING STATE / ACTION SPACE
// =============================================
// State: [voltageZone, loadLevel, batteryLevel(simulated)]
// Action: {0: relay OFF, 1: relay ON, 2: reduce load, 3: hold}
// Reward: +1 energy saved, -2 for unsafe state, 0 for neutral

const Q = {};          // Q-table: state_key → [q0, q1, q2, q3]
const ALPHA = 0.1;     // Learning rate
const GAMMA = 0.9;     // Discount factor
let EPSILON = 0.2;     // Exploration rate (decays over time)
let stepCount = 0;

function getStateKey(data) {
  const voltZone = data.voltage < 210 ? 'low' : data.voltage > 240 ? 'high' : 'normal';
  const loadLevel = data.power < 500 ? 'light' : data.power < 1500 ? 'medium' : 'heavy';
  const tempZone = data.temperature < 35 ? 'cool' : data.temperature < 43 ? 'warm' : 'hot';
  return `${voltZone}|${loadLevel}|${tempZone}`;
}

function initQState(key) {
  if (!Q[key]) Q[key] = [0, 0, 0, 0]; // [relay_off, relay_on, reduce_load, hold]
}

function chooseAction(stateKey) {
  initQState(stateKey);
  if (Math.random() < EPSILON) {
    return Math.floor(Math.random() * 4); // Explore
  }
  return Q[stateKey].indexOf(Math.max(...Q[stateKey])); // Exploit
}

function computeReward(data, action) {
  let reward = 0;
  // Penalize unsafe states
  if (data.temperature > THRESHOLDS.TEMP_MAX) reward -= 3;
  if (data.voltage < THRESHOLDS.VOLTAGE_MIN)  reward -= 2;
  if (data.power > THRESHOLDS.POWER_LIMIT)    reward -= 2;
  // Reward energy savings
  if (action === 0 && data.power > 1000) reward += 1.5; // Relay off under high load = good
  if (action === 2 && data.power > 1500) reward += 2;   // Reduce load when heavy = good
  if (action === 1 && data.voltage > 220 && data.temperature < 38) reward += 1; // Safe to turn on
  return reward;
}

function updateQ(stateKey, action, reward, nextStateKey) {
  initQState(stateKey);
  initQState(nextStateKey);
  const maxNext = Math.max(...Q[nextStateKey]);
  Q[stateKey][action] += ALPHA * (reward + GAMMA * maxNext - Q[stateKey][action]);
  // Decay exploration
  if (stepCount % 50 === 0) EPSILON = Math.max(0.05, EPSILON * 0.99);
  stepCount++;
}

// =============================================
//  ACTION NAMES
// =============================================
const ACTION_NAMES = ['relay_off', 'relay_on', 'reduce_load', 'hold'];
const ACTION_COMMANDS = {
  relay_off:    { relay: 'OFF' },
  relay_on:     { relay: 'ON' },
  reduce_load:  { relay: 'OFF', alert: 'reduce_load' },
  hold:         null
};

// =============================================
//  LAYER 1 — RULE-BASED (overrides RL if unsafe)
// =============================================
function ruleBasedDecision(data) {
  const alerts = [];

  if (data.temperature > THRESHOLDS.TEMP_MAX) {
    alerts.push({
      action: 'relay_off',
      reason: `🌡️ Overtemperature: ${data.temperature}°C > ${THRESHOLDS.TEMP_MAX}°C — Relay OFF for safety`,
      priority: 'critical'
    });
  }

  if (data.voltage < THRESHOLDS.VOLTAGE_MIN) {
    alerts.push({
      action: 'relay_off',
      reason: `⚡ Low voltage: ${data.voltage}V < ${THRESHOLDS.VOLTAGE_MIN}V — Switching to battery backup`,
      priority: 'critical'
    });
  }

  if (data.voltage > THRESHOLDS.VOLTAGE_MAX) {
    alerts.push({
      action: 'relay_off',
      reason: `⚡ Overvoltage: ${data.voltage}V > ${THRESHOLDS.VOLTAGE_MAX}V — Protective disconnect`,
      priority: 'critical'
    });
  }

  if (data.power > THRESHOLDS.POWER_LIMIT) {
    alerts.push({
      action: 'reduce_load',
      reason: `🔋 Overload: ${data.power.toFixed(0)}W > ${THRESHOLDS.POWER_LIMIT}W — Load shedding`,
      priority: 'high'
    });
  }

  if (data.temperature > THRESHOLDS.TEMP_WARN && data.temperature <= THRESHOLDS.TEMP_MAX) {
    alerts.push({
      action: 'hold',
      reason: `⚠️ Temperature warning: ${data.temperature}°C — Monitor closely`,
      priority: 'warning'
    });
  }

  return alerts;
}

// =============================================
//  MAIN DECISION FUNCTION
// =============================================
let prevStateKey = null;
let prevAction = null;

function makeDecision(data) {
  const decisions = [];

  // --- Layer 1: Rule-Based ---
  const rules = ruleBasedDecision(data);
  if (rules.length > 0) {
    for (const rule of rules) {
      logDecision({ voltage: data.voltage, current: data.current, temperature: data.temperature },
                  rule.action, rule.reason, null);
      decisions.push({ ...rule, layer: 'rule-based', command: ACTION_COMMANDS[rule.action] });
    }
    // If critical — skip RL this cycle, safety first
    if (rules.some(r => r.priority === 'critical')) {
      return { decisions, rlAction: null, stateKey: getStateKey(data) };
    }
  }

  // --- Layer 2: Q-Learning ---
  const stateKey = getStateKey(data);

  // Update Q-table from previous step
  if (prevStateKey !== null && prevAction !== null) {
    const reward = computeReward(data, prevAction);
    updateQ(prevStateKey, prevAction, reward, stateKey);
  }

  const actionIdx = chooseAction(stateKey);
  const actionName = ACTION_NAMES[actionIdx];

  prevStateKey = stateKey;
  prevAction = actionIdx;

  const rlReason = `🤖 RL (Q-Learning) | State: ${stateKey} | Action: ${actionName} | ε=${EPSILON.toFixed(3)}`;
  logDecision({ voltage: data.voltage, current: data.current, temperature: data.temperature },
              actionName, rlReason, computeReward(data, actionIdx));

  decisions.push({
    action: actionName,
    reason: rlReason,
    priority: 'info',
    layer: 'q-learning',
    command: ACTION_COMMANDS[actionName]
  });

  return { decisions, rlAction: actionName, stateKey };
}

module.exports = { makeDecision, THRESHOLDS };
