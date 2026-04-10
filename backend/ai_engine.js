// =============================================
//  Smart Grid — AI Decision Engine
//  Layer 1: Rule-Based (immediate safety)
//  Layer 2: LSTM (anomaly prediction)
//  Layer 3: DQN (self-healing action)
// =============================================

const { logDecision } = require('./db');
const LSTMPredictor = require('./lstm_model');
const DQNAgent = require('./dqn_agent');
const { classifyFault } = require('./fault_classifier');
const { sendSMSAlert } = require('./twilio_alert');

// Initialize models
const lstm = new LSTMPredictor();
const dqn = new DQNAgent();

// =============================================
//  THRESHOLDS (match config.h)
// =============================================
const THRESHOLDS = {
  TEMP_MAX:     45,    // °C
  TEMP_WARN:    40,    // °C
  VOLTAGE_MIN:  10.5,  // V  — low battery for 12V system
  VOLTAGE_MAX:  14.5,  // V  — overvoltage
  POWER_LIMIT:  500,   // W  — overload (increased to ignore phantom readings)
  CURRENT_MAX:  30     // A
};

// =============================================
//  ACTION COMMANDS
// =============================================
const ACTION_COMMANDS = {
  relay_off:     { relay: 'OFF' },
  relay_on:      { relay: 'ON' },
  reduce_load:   { relay: 'OFF', alert: 'reduce_load' }, // In a real system, might target a specific load relay
  switch_backup: { relay: 'OFF', alert: 'backup_active' },
  hold:          null
};

// =============================================
//  LAYER 1 — RULE-BASED (overrides RL if unsafe)
// =============================================
function ruleBasedDecision(data) {
  const alerts = [];

  if (data.temperature > THRESHOLDS.TEMP_MAX) {
    alerts.push({
      action: 'relay_off',
      reason: `🌡️ Overtemperature: ${data.temperature.toFixed(1)}°C > ${THRESHOLDS.TEMP_MAX}°C — Safety OFF`,
      priority: 'critical'
    });
  }

  if (data.voltage < THRESHOLDS.VOLTAGE_MIN) {
    alerts.push({
      action: 'switch_backup',
      reason: `⚡ Low voltage: ${data.voltage.toFixed(1)}V < ${THRESHOLDS.VOLTAGE_MIN}V — Battery backup`,
      priority: 'critical'
    });
  }

  if (data.voltage > THRESHOLDS.VOLTAGE_MAX) {
    alerts.push({
      action: 'relay_off',
      reason: `⚡ Overvoltage: ${data.voltage.toFixed(1)}V > ${THRESHOLDS.VOLTAGE_MAX}V — Disconnect`,
      priority: 'critical'
    });
  }

  if (data.power > THRESHOLDS.POWER_LIMIT) {
    alerts.push({
      action: 'reduce_load',
      reason: `🔋 Overload: ${data.power.toFixed(0)}W > ${THRESHOLDS.POWER_LIMIT}W — Load shedding`,
      priority: 'critical'
    });
  }

  // Generate a synthesized anomaly score for DQN training if rules trigger
  let manualAnomaly = 0;
  if (alerts.length > 0) manualAnomaly = 1.0;
  else if (data.temperature > THRESHOLDS.TEMP_WARN) manualAnomaly = 0.5;

  return { alerts, manualAnomaly };
}

// =============================================
//  REWARD FUNCTION FOR DQN
// =============================================
function computeReward(data, action) {
  let reward = 0;
  if (data.temperature > THRESHOLDS.TEMP_MAX) reward -= 5;
  if (data.voltage < THRESHOLDS.VOLTAGE_MIN)  reward -= 3;
  if (data.power > THRESHOLDS.POWER_LIMIT)    reward -= 3;
  
  if (action === 'relay_off' && data.power > THRESHOLDS.POWER_LIMIT) reward += 2;
  if (action === 'reduce_load' && data.power > THRESHOLDS.POWER_LIMIT * 0.8) reward += 2;
  if (action === 'relay_on' && data.voltage >= THRESHOLDS.VOLTAGE_MIN && data.temperature < THRESHOLDS.TEMP_WARN) reward += 1;
  if (action === 'switch_backup' && data.voltage < THRESHOLDS.VOLTAGE_MIN) reward += 3;
  
  return reward;
}

// =============================================
//  MAIN DECISION FUNCTION (ASYNC)
// =============================================
let prevStateVector = null;
let prevActionName = null;

async function makeDecision(data) {
  const decisions = [];

  // 1. Layer 1: Rule-Based
  const { alerts, manualAnomaly } = ruleBasedDecision(data);
  for (const rule of alerts) {
    logDecision({ voltage: data.voltage, current: data.current, temperature: data.temperature },
                rule.action, rule.reason, null);
    decisions.push({ ...rule, layer: 'rule-based', command: ACTION_COMMANDS[rule.action] });
  }

  // 2. Layer 2: LSTM Anomaly Prediction
  let lstmPrediction = await lstm.processReading(data);
  if (!lstmPrediction) {
    // If not enough data buffer, pass default prediction
    lstmPrediction = { predictedV: data.voltage, predictedI: data.current, predictedT: data.temperature, anomalyScore: manualAnomaly };
  } else {
    // Merge manual rule-based anomaly knowledge into LSTM score for training/state
    lstmPrediction.anomalyScore = Math.max(lstmPrediction.anomalyScore, manualAnomaly);
  }

  // 3. Layer 3: DQN Agent
  const stateVector = dqn.getStateVector(data, lstmPrediction);
  
  // Update DQN memory with previous transition
  if (prevStateVector && prevActionName) {
     const reward = computeReward(data, prevActionName);
     dqn.remember(prevStateVector, prevActionName, reward, stateVector, false);
     await dqn.replay(); // Train
  }

  // If rules triggered a critical override, we respect it and don't let DQN act
  let finalDqnAction = null;
  const isCritical = alerts.some(r => r.priority === 'critical');
  
  if (!isCritical) {
    finalDqnAction = dqn.act(stateVector);
    
    if (finalDqnAction && finalDqnAction !== 'hold') {
      const rlReason = `🤖 Auto-Healing | Action: ${finalDqnAction} | Anomaly: ${(lstmPrediction.anomalyScore*100).toFixed(0)}%`;
      logDecision({ voltage: data.voltage, current: data.current, temperature: data.temperature },
                  finalDqnAction, rlReason, null);
                  
      decisions.push({
        action: finalDqnAction,
        reason: rlReason,
        priority: 'info',
        layer: 'dqn-agent',
        command: ACTION_COMMANDS[finalDqnAction]
      });
    }
  }

  prevStateVector = stateVector;
  prevActionName = finalDqnAction || alerts[0]?.action || 'hold';

  // 4. Fault Classification
  const fault = classifyFault(alerts, lstmPrediction, { epsilon: dqn.epsilon, action: finalDqnAction }, data, THRESHOLDS);

  // 5. Dispatch SMS if needed
  if (fault.shouldAlert) {
    sendSMSAlert(fault.severity, fault.faultType, fault.message).catch(e => {
      console.error('[AI] SMS dispatch error:', e.message);
    });
  }

  return { decisions, lstmPrediction, dqnStatus: { epsilon: dqn.epsilon, action: finalDqnAction }, fault };
}

module.exports = { makeDecision, THRESHOLDS };
