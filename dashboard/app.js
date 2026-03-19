// =============================================
//  Smart Grid Dashboard — app.js
//  Real-time data, WebSocket, ApexCharts,
//  Relay control, Tamil voice alerts
// =============================================

// Auto-detect backend URL.
// If served via http:// (from Node.js), use the same host.
// If opened as file://, fall back to localhost:3000.
const _isFile    = location.protocol === 'file:';
const _host      = _isFile ? 'localhost:3000' : location.host;
const _protoWS   = location.protocol === 'https:' ? 'wss:' : 'ws:';
const _protoAPI  = location.protocol === 'https:' ? 'https:' : 'http:';
const BACKEND_WS  = `${_protoWS}//${_host}`;
const BACKEND_API = `${_protoAPI}//${_host}`;
const POWER_LIMIT = 2000;

// =============================================
//  STATE
// =============================================
const state = {
  ws: null,
  wsConnected: false,
  simulate: false,      // True when no backend is reachable
  simInterval: null,
  readings: 0,
  aiActions: 0,
  alertCount: 0,
  peakPower: 0,
  voltageSum: 0,
  startTime: Date.now(),

  // Rolling history for charts (last 30 points)
  history: {
    voltage:     [],
    current:     [],
    temperature: [],
    timestamps:  []
  },

  // Current alert text (for Speech synthesis)
  lang: 'ta',
  currentAlert: '',
  relayStates: { main: false, load1: false, load2: false, backup: false }
};

// =============================================
//  CLOCK
// =============================================
function updateClock() {
  const now = new Date();
  document.getElementById('header-time').textContent =
    now.toLocaleTimeString('en-IN', { hour12: false });

  const elapsed = Math.floor((Date.now() - state.startTime) / 1000);
  const m = String(Math.floor(elapsed / 60)).padStart(2, '0');
  const s = String(elapsed % 60).padStart(2, '0');
  document.getElementById('stat-uptime').textContent = `${m}:${s}`;
}
setInterval(updateClock, 1000);
updateClock();

// =============================================
//  APEXCHARTS — MAIN LINE CHART
// =============================================
const chartOptions = {
  chart: {
    type: 'line',
    height: 260,
    animations: { enabled: true, easing: 'linear', dynamicAnimation: { speed: 800 } },
    background: 'transparent',
    toolbar: { show: false },
    zoom: { enabled: false }
  },
  stroke: { curve: 'smooth', width: [2.5, 2.5, 2.5] },
  colors: ['#06b6d4', '#10b981', '#f59e0b'],
  series: [
    { name: 'Voltage (V)', data: [] },
    { name: 'Current (A×10)', data: [] },
    { name: 'Temperature (°C)', data: [] }
  ],
  xaxis: {
    type: 'category',
    categories: [],
    labels: { style: { colors: '#64748b', fontSize: '11px' }, maxTicksLimit: 8 },
    axisBorder: { show: false }, axisTicks: { show: false }
  },
  yaxis: { labels: { style: { colors: '#64748b', fontSize: '11px' }, formatter: (v) => v.toFixed(1) } },
  grid: { borderColor: 'rgba(100,116,139,0.12)', strokeDashArray: 3 },
  legend: { labels: { colors: '#94a3b8' }, position: 'top', fontSize: '12px' },
  tooltip: {
    theme: 'dark',
    style: { fontSize: '12px' }
  },
  markers: { size: 0 }
};

const chart = new ApexCharts(document.getElementById('main-chart'), chartOptions);
chart.render();

function updateChart(voltage, current, temperature, ts) {
  const h = state.history;
  const label = new Date(ts).toLocaleTimeString('en-IN', { hour12: false });

  h.voltage.push(Math.round(voltage * 10) / 10);
  h.current.push(Math.round(current * 100) / 100 * 10); // Scale ×10 for visibility
  h.temperature.push(Math.round(temperature * 10) / 10);
  h.timestamps.push(label);

  if (h.voltage.length > 30) {
    h.voltage.shift(); h.current.shift();
    h.temperature.shift(); h.timestamps.shift();
  }

  chart.updateSeries([
    { name: 'Voltage (V)',      data: [...h.voltage] },
    { name: 'Current (A×10)',   data: [...h.current] },
    { name: 'Temperature (°C)', data: [...h.temperature] }
  ]);
  chart.updateOptions({ xaxis: { categories: [...h.timestamps] } }, false, false);
}

// =============================================
//  UPDATE METRIC CARDS
// =============================================
function updateCards(data) {
  const { voltage, current, temperature, power } = data;
  const p = power || voltage * current;

  // Voltage
  document.getElementById('val-voltage').textContent = voltage.toFixed(1);
  const vBadge = document.getElementById('volt-status');
  const card_v = document.getElementById('card-voltage');
  if (voltage < 210) {
    vBadge.textContent = 'LOW ⚠'; vBadge.className = 'badge badge--danger';
    card_v.classList.add('card-alerting');
  } else if (voltage > 250) {
    vBadge.textContent = 'HIGH ⚠'; vBadge.className = 'badge badge--danger';
    card_v.classList.add('card-alerting');
  } else {
    vBadge.textContent = 'NORMAL'; vBadge.className = 'badge badge--success';
    card_v.classList.remove('card-alerting');
  }

  // Current
  document.getElementById('val-current').textContent = current.toFixed(2);

  // Power
  document.getElementById('val-power').textContent = p.toFixed(1);
  const pct = Math.min((p / POWER_LIMIT) * 100, 100);
  document.getElementById('power-bar').style.width = pct + '%';
  document.getElementById('power-bar').style.background =
    pct > 80 ? 'linear-gradient(90deg,#f59e0b,#ef4444)' : 'linear-gradient(90deg,#10b981,#06b6d4)';
  document.getElementById('power-pct').textContent = `${pct.toFixed(0)}% of limit`;

  // Temperature
  document.getElementById('val-temp').textContent = temperature.toFixed(1);
  const tBadge = document.getElementById('temp-status');
  const card_t = document.getElementById('card-temp');
  if (temperature > 45) {
    tBadge.textContent = 'CRITICAL 🔴'; tBadge.className = 'badge badge--danger';
    card_t.classList.add('card-alerting');
  } else if (temperature > 40) {
    tBadge.textContent = 'WARN 🟡'; tBadge.className = 'badge badge--warning';
    card_t.classList.remove('card-alerting');
  } else {
    tBadge.textContent = 'NORMAL'; tBadge.className = 'badge badge--success';
    card_t.classList.remove('card-alerting');
  }

  // Stats
  state.readings++;
  state.voltageSum += voltage;
  if (p > state.peakPower) state.peakPower = p;

  document.getElementById('stat-readings').textContent = state.readings;
  document.getElementById('stat-avg-v').textContent = (state.voltageSum / state.readings).toFixed(1) + 'V';
  document.getElementById('stat-peak-p').textContent = state.peakPower.toFixed(0) + 'W';
  document.getElementById('stat-ai-actions').textContent = state.aiActions;
  document.getElementById('stat-alerts').textContent = state.alertCount;
}

// =============================================
//  AI DECISION LOG
// =============================================
function addLog(msg, priority = 'info', action = '', layer = '') {
  const log = document.getElementById('ai-log');
  const entry = document.createElement('div');

  const layerClass = layer === 'q-learning' ? 'log-rl' :
                     priority === 'critical' ? 'log-critical' :
                     priority === 'high'     ? 'log-warning' : 'log-info';

  const badgeClass = priority === 'critical' ? 'badge--danger' :
                     priority === 'high'     ? 'badge--warning' :
                     layer === 'q-learning'  ? 'badge--info' : 'badge--neutral';

  const badgeText = layer === 'q-learning' ? 'RL' :
                    priority === 'critical' ? 'CRIT' :
                    priority === 'high'     ? 'WARN' : 'INFO';

  const time = new Date().toLocaleTimeString('en-IN', { hour12: false });

  entry.className = `log-entry ${layerClass}`;
  entry.innerHTML = `
    <span class="log-time">${time}</span>
    <span class="log-badge badge ${badgeClass}">${badgeText}</span>
    <span class="log-msg">${msg}</span>
  `;

  log.insertBefore(entry, log.firstChild);

  // Keep max 40 entries
  while (log.children.length > 40) log.removeChild(log.lastChild);

  if (action && action !== 'hold') state.aiActions++;
}

function clearLog() {
  document.getElementById('ai-log').innerHTML = '';
}

// =============================================
//  ALERTS
// =============================================
const MESSAGES = {
  ta: {
    overvoltage:  'அதிக மின்னழுத்தம் — Overvoltage detected! Relay disconnected.',
    undervoltage: 'குறைந்த மின்னழுத்தம் — Undervoltage! Switching to battery backup.',
    overtemp:     'அதிக வெப்பநிலை — High temperature! Charging relay turned OFF.',
    overload:     'அதிக மின்சாரம் பயன்படுத்தப்படுகிறது — High power! Load shedding active.',
    warning:      'எச்சரிக்கை — System warning. Monitor closely.',
    normal:       'அனைத்தும் சரியாக உள்ளது — All systems normal'
  },
  ml: {
    overvoltage:  'ഉയർന്ന വോൾട്ടേജ് — Overvoltage detected! Relay disconnected.',
    undervoltage: 'കുറഞ്ഞ വോൾട്ടേജ് — Undervoltage! Switching to battery backup.',
    overtemp:     'ഉയർന്ന താപനില — High temperature! Charging relay turned OFF.',
    overload:     'അമിതഭാരം — High power! Load shedding active.',
    warning:      'മുന്നറിയിപ്പ് — System warning. Monitor closely.',
    normal:       'എല്ലാം സാധാരണ നിലയിലാണ് — All systems normal'
  }
};

function changeLanguage() {
  state.lang = document.getElementById('lang-select').value;
  const icon = document.getElementById('lang-alert-box').querySelector('.lang-icon');
  if (icon.textContent === '✅') {
    state.currentAlert = MESSAGES[state.lang].normal;
    document.getElementById('lang-alert-text').textContent = MESSAGES[state.lang].normal;
  }
}

function showAlert(message, priority = 'high') {
  document.getElementById('alert-banner').classList.remove('hidden');
  document.getElementById('alert-text').textContent = message;
  state.alertCount++;
  document.getElementById('stat-alerts').textContent = state.alertCount;

  // Auto-dismiss after 8 seconds
  clearTimeout(state.alertTimer);
  state.alertTimer = setTimeout(dismissAlert, 8000);
}

function dismissAlert() {
  document.getElementById('alert-banner').classList.add('hidden');
}

function updateRegionalAlert(alerts) {
  const box = document.getElementById('lang-alert-box');
  const txt = document.getElementById('lang-alert-text');
  const icon = box.querySelector('.lang-icon');
  const msgs = MESSAGES[state.lang];

  if (!alerts || alerts.length === 0) {
    box.className = 'lang-alert-box';
    icon.textContent = '✅';
    txt.textContent = msgs.normal;
    state.currentAlert = msgs.normal;
    return;
  }

  const top = alerts[0];
  let localMsg = msgs.warning;

  if (top.message.toLowerCase().includes('voltage')) {
    if (top.message.toLowerCase().includes('low') || top.message.includes('10.5') || top.message.includes('210')) localMsg = msgs.undervoltage;
    else localMsg = msgs.overvoltage;
  }
  if (top.message.toLowerCase().includes('emperature') || top.message.includes('45')) localMsg = msgs.overtemp;
  if (top.message.toLowerCase().includes('load') || top.message.includes('50') || top.message.includes('2000')) localMsg = msgs.overload;

  state.currentAlert = localMsg;
  box.className = 'lang-alert-box alert-critical';
  icon.textContent = '🚨';
  txt.textContent = localMsg;

  showAlert(top.message, top.priority);
}

function speakAlert() {
  if (!('speechSynthesis' in window)) { alert('Speech synthesis not supported in this browser.'); return; }
  const utter = new SpeechSynthesisUtterance(state.currentAlert);
  utter.lang = state.lang === 'ml' ? 'ml-IN' : 'ta-IN';
  utter.rate = 0.9;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utter);
}

function testAlert() {
  const msgs = MESSAGES[state.lang];
  state.currentAlert = msgs.overload;
  document.getElementById('lang-alert-text').textContent = msgs.overload;
  document.getElementById('lang-alert-box').className = 'lang-alert-box alert-critical';
  document.getElementById('lang-alert-box').querySelector('.lang-icon').textContent = '🚨';
  showAlert('⚡ Test: ' + msgs.overload, 'high');
  speakAlert();
}

// =============================================
//  RELAY CONTROL
// =============================================
async function sendRelay(name, command) {
  // Update UI immediately
  const selector = `.relay-item:nth-child(${['main','load1','load2','backup'].indexOf(name)+1}) .relay-btn`;
  document.querySelectorAll(`.relay-toggle`)[['main','load1','load2','backup'].indexOf(name)]
    .querySelectorAll('.relay-btn').forEach(btn => btn.classList.remove('active'));

  const buttons = document.querySelectorAll('.relay-toggle')[['main','load1','load2','backup'].indexOf(name)]
    .querySelectorAll('.relay-btn');
  buttons[command === 'ON' ? 0 : 1].classList.add('active');

  state.relayStates[name] = command === 'ON';
  addLog(`Relay [${name.toUpperCase()}] → ${command} (manual dashboard command)`, 'info', command);

  // Send to backend if connected
  if (state.wsConnected && state.ws) {
    state.ws.send(JSON.stringify({ type: 'relay_command', relay: command, name }));
  } else {
    try {
      await fetch(`${BACKEND_API}/api/relay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ relay: command })
      });
    } catch (e) { /* offline — UI-only */ }
  }
}

// =============================================
//  PROCESS INCOMING DATA (WS or simulated)
// =============================================
function processData(data, decisions = [], alerts = []) {
  updateCards(data);
  updateChart(data.voltage, data.current, data.temperature, data.timestamp || Date.now());

  // Log AI decisions
  for (const dec of decisions) {
    addLog(dec.reason, dec.priority, dec.action, dec.layer);
  }

  // Handle alerts
  updateRegionalAlert(alerts);
}

// =============================================
//  WEBSOCKET CONNECTION
// =============================================
function connectWebSocket() {
  try {
    const ws = new WebSocket(BACKEND_WS);
    state.ws = ws;

    ws.addEventListener('open', () => {
      state.wsConnected = true;
      state.simulate = false;
      stopSimulation();
      setConnectionStatus('connected', 'Live — Backend Connected');
      document.getElementById('badge-ai').textContent = 'LIVE';
      addLog('WebSocket connected to Smart Grid backend', 'info');
    });

    ws.addEventListener('message', (evt) => {
      try {
        const msg = JSON.parse(evt.data);
        if (msg.type === 'sensor_update') {
          processData(msg.data, msg.decisions || [], msg.alerts || []);
        } else if (msg.type === 'initial') {
          updateCards(msg.data);
        }
      } catch (e) {}
    });

    ws.addEventListener('close', () => {
      state.wsConnected = false;
      setConnectionStatus('error', 'Disconnected — Using Simulation');
      addLog('Backend disconnected — switching to simulation mode', 'warning');
      startSimulation();
      // Reconnect after 5s
      setTimeout(connectWebSocket, 5000);
    });

    ws.addEventListener('error', () => {
      setConnectionStatus('error', 'No Backend — Simulation Mode');
      if (!state.simulate) startSimulation();
    });

  } catch (e) {
    setConnectionStatus('error', 'Simulation Mode');
    startSimulation();
  }
}

function setConnectionStatus(type, text) {
  document.getElementById('status-dot').className = `status-dot ${type}`;
  document.getElementById('status-text').textContent = text;

  const mqttBadge = document.getElementById('badge-mqtt');
  mqttBadge.textContent = type === 'connected' ? 'CONNECTED' : 'OFFLINE';
  mqttBadge.className = 'badge ' + (type === 'connected' ? 'badge--success' : 'badge--danger');
}

// =============================================
//  SIMULATION MODE (no backend needed)
// =============================================
let simStep = 0;
const simBase = { voltage: 230, current: 3.5, temperature: 32 };

function generateSimData() {
  simStep++;

  // Gradually drift values + add noise
  let v = simBase.voltage + Math.sin(simStep * 0.15) * 18 + (Math.random() - 0.5) * 5;
  let i = simBase.current + Math.sin(simStep * 0.2) * 2  + (Math.random() - 0.5) * 0.4;
  let t = simBase.temperature + simStep * 0.05          + (Math.random() - 0.5) * 1.5;
  t = Math.min(t, 55); // Cap temperature

  // Simulate threshold breaches
  const decisions = [];
  const alerts    = [];

  if (t > 45) {
    decisions.push({ action: 'relay_off', reason: `🌡️ Overtemp: ${t.toFixed(1)}°C — Relay OFF`, priority: 'critical', layer: 'rule-based' });
    alerts.push({ message: `Temperature critical: ${t.toFixed(1)}°C > 45°C`, priority: 'critical' });
  }
  if (v < 210) {
    decisions.push({ action: 'relay_off', reason: `⚡ Low voltage: ${v.toFixed(1)}V — Battery backup`, priority: 'critical', layer: 'rule-based' });
    alerts.push({ message: `Low voltage: ${v.toFixed(1)}V < 210V`, priority: 'critical' });
  }

  // Simulated RL decision every ~5 readings
  if (simStep % 5 === 0) {
    const states = ['normal|medium|cool', 'normal|light|warm', 'high|heavy|warm'];
    const actions = ['hold', 'relay_on', 'reduce_load'];
    const idx = Math.floor(Math.random() * 3);
    decisions.push({
      action: actions[idx],
      reason: `🤖 RL (Q-Learning) | State: ${states[idx]} | Action: ${actions[idx]} | ε=0.15`,
      priority: 'info',
      layer: 'q-learning'
    });
  }

  const power = Math.max(0, v * i);
  return {
    data: { voltage: +v.toFixed(1), current: +i.toFixed(2), temperature: +t.toFixed(1), power: +power.toFixed(1), timestamp: new Date().toISOString() },
    decisions,
    alerts
  };
}

function startSimulation() {
  if (state.simulate) return;
  state.simulate = true;
  setConnectionStatus('', 'Simulation Mode (No Backend)');
  addLog('🔁 Running in simulation mode — visualizing live sensor data', 'info');

  // Immediate first update
  const { data, decisions, alerts } = generateSimData();
  processData(data, decisions, alerts);

  state.simInterval = setInterval(() => {
    const { data, decisions, alerts } = generateSimData();
    processData(data, decisions, alerts);
  }, 3000);
}

function stopSimulation() {
  if (state.simInterval) { clearInterval(state.simInterval); state.simInterval = null; }
  state.simulate = false;
}

// =============================================
//  GRID / BATTERY STATUS UPDATE
// =============================================
function updateGridStatus(voltage) {
  const gridBadge = document.getElementById('badge-grid');
  const battBadge = document.getElementById('badge-battery');

  if (voltage < 210) {
    gridBadge.textContent = 'FAULT';
    gridBadge.className = 'badge badge--danger';
    battBadge.textContent = 'DISCHARGING';
    battBadge.className = 'badge badge--warning';
  } else if (voltage > 250) {
    gridBadge.textContent = 'OVERVOLT';
    gridBadge.className = 'badge badge--danger';
  } else {
    gridBadge.textContent = 'ACTIVE';
    gridBadge.className = 'badge badge--success';
    battBadge.textContent = 'CHARGING';
    battBadge.className = 'badge badge--success';
  }
}

// ===== Patch processData to also update grid status =====
const _originalProcessData = processData;
window.processData = function(data, decisions, alerts) {
  _originalProcessData(data, decisions, alerts);
  updateGridStatus(data.voltage);
};

// =============================================
//  INIT
// =============================================
(function init() {
  state.currentAlert = MESSAGES[state.lang].normal;
  document.getElementById('lang-alert-text').textContent = state.currentAlert;
  connectWebSocket();
})();
