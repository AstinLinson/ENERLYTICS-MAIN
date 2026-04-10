// =============================================
//  Fault Classifier
//  Consumes LSTM predictions + DQN outputs
//  Produces structured fault objects with severity
// =============================================

const FAULT_TYPES = {
  HW_FAULT:         'HARDWARE_FAULT',
  PREDICTED_HW:     'PREDICTED_HW_FAULT',
  THERMAL_FAULT:    'THERMAL_FAULT',
  DEGRADED_STATE:   'DEGRADED_STATE',
  ANOMALY_DETECTED: 'ANOMALY_DETECTED',
  NORMAL:           'NORMAL'
};

const SEVERITY = {
  CRITICAL: 'CRITICAL',
  WARNING:  'WARNING',
  CAUTION:  'CAUTION',
  INFO:     'INFO',
  NORMAL:   'NORMAL'
};

// Track consecutive negative rewards for DQN degraded detection
let consecutiveNegativeRewards = 0;

function classifyFault(ruleAlerts, lstmPrediction, dqnStatus, currentData, thresholds) {
  const result = {
    faultType: FAULT_TYPES.NORMAL,
    severity: SEVERITY.NORMAL,
    message: 'All systems normal',
    shouldAlert: false,
    details: {}
  };

  // ---- Priority 1: Rule-based critical overrides (Immediate HW danger) ----
  const hasCritical = ruleAlerts.some(a => a.priority === 'critical');
  if (hasCritical) {
    const topAlert = ruleAlerts.find(a => a.priority === 'critical');
    result.faultType = FAULT_TYPES.HW_FAULT;
    result.severity = SEVERITY.CRITICAL;
    result.message = topAlert.reason;
    result.shouldAlert = true;
    result.details = {
      voltage: currentData.voltage,
      current: currentData.current,
      temperature: currentData.temperature,
      trigger: 'rule-based-critical'
    };
    return result;
  }

  // ---- Priority 2: LSTM predicted voltage collapse ----
  if (lstmPrediction && lstmPrediction.anomalyScore > 0.7
      && lstmPrediction.predictedV < thresholds.VOLTAGE_MIN) {
    result.faultType = FAULT_TYPES.PREDICTED_HW;
    result.severity = SEVERITY.WARNING;
    result.message = `LSTM predicts voltage drop to ${lstmPrediction.predictedV.toFixed(1)}V in 30s (anomaly: ${(lstmPrediction.anomalyScore*100).toFixed(0)}%)`;
    result.shouldAlert = true;
    result.details = {
      predictedV: lstmPrediction.predictedV,
      anomalyScore: lstmPrediction.anomalyScore,
      trigger: 'lstm-voltage-prediction'
    };
    return result;
  }

  // ---- Priority 3: LSTM predicted thermal fault ----
  if (lstmPrediction && lstmPrediction.anomalyScore > 0.7
      && lstmPrediction.predictedT > thresholds.TEMP_MAX) {
    result.faultType = FAULT_TYPES.THERMAL_FAULT;
    result.severity = SEVERITY.WARNING;
    result.message = `LSTM predicts temperature spike to ${lstmPrediction.predictedT.toFixed(1)}°C in 30s (anomaly: ${(lstmPrediction.anomalyScore*100).toFixed(0)}%)`;
    result.shouldAlert = true;
    result.details = {
      predictedT: lstmPrediction.predictedT,
      anomalyScore: lstmPrediction.anomalyScore,
      trigger: 'lstm-thermal-prediction'
    };
    return result;
  }

  // ---- Priority 4: DQN struggling (consecutive negative rewards) ----
  // We infer this from the DQN action — if it keeps choosing emergency actions
  const emergencyActions = ['relay_off', 'reduce_load', 'switch_backup'];
  if (dqnStatus && emergencyActions.includes(dqnStatus.action)) {
    consecutiveNegativeRewards++;
  } else {
    consecutiveNegativeRewards = Math.max(0, consecutiveNegativeRewards - 1);
  }

  if (consecutiveNegativeRewards >= 3) {
    result.faultType = FAULT_TYPES.DEGRADED_STATE;
    result.severity = SEVERITY.CAUTION;
    result.message = `DQN agent in distress — ${consecutiveNegativeRewards} consecutive emergency actions`;
    result.shouldAlert = false; // WebSocket + app only, no SMS
    result.details = {
      consecutiveActions: consecutiveNegativeRewards,
      lastAction: dqnStatus.action,
      trigger: 'dqn-degraded'
    };
    return result;
  }

  // ---- Priority 5: Elevated anomaly score (early warning) ----
  if (lstmPrediction && lstmPrediction.anomalyScore > 0.4) {
    result.faultType = FAULT_TYPES.ANOMALY_DETECTED;
    result.severity = SEVERITY.INFO;
    result.message = `Anomaly score elevated: ${(lstmPrediction.anomalyScore*100).toFixed(0)}% — monitoring`;
    result.shouldAlert = false;
    result.details = {
      anomalyScore: lstmPrediction.anomalyScore,
      trigger: 'lstm-anomaly-elevated'
    };
    return result;
  }

  // ---- Normal ----
  consecutiveNegativeRewards = 0;
  return result;
}

module.exports = { classifyFault, FAULT_TYPES, SEVERITY };
