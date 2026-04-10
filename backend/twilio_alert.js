// =============================================
//  Twilio SMS Alert Module
//  Sends SMS alerts for CRITICAL and WARNING faults
//  5-minute cooldown to prevent alert spam
// =============================================

let lastAlertTime = {};         // Per-faultType cooldown
const COOLDOWN_MS = 300_000;    // 5 minutes

async function sendSMSAlert(severity, faultType, message) {
  const TWILIO_SID   = process.env.TWILIO_SID;
  const TWILIO_TOKEN = process.env.TWILIO_TOKEN;
  const TWILIO_FROM  = process.env.TWILIO_FROM;
  const ALERT_PHONE  = process.env.ALERT_PHONE;

  // Only send for CRITICAL and WARNING
  if (!['CRITICAL', 'WARNING'].includes(severity)) return false;

  // Check credentials
  if (!TWILIO_SID || !TWILIO_TOKEN || !TWILIO_FROM || !ALERT_PHONE) {
    console.log('[SMS] Twilio not configured — skipping alert');
    return false;
  }

  // Per-fault cooldown (so different faults can each alert separately)
  const now = Date.now();
  if (lastAlertTime[faultType] && (now - lastAlertTime[faultType] < COOLDOWN_MS)) {
    console.log(`[SMS] Cooldown active for ${faultType} — skipping`);
    return false;
  }
  lastAlertTime[faultType] = now;

  const body = `ENERLYTICS [${severity}]\n`
    + `Fault: ${faultType}\n`
    + `${message}\n`
    + `Time: ${new Date().toLocaleTimeString('en-IN')}`;

  try {
    const auth = Buffer.from(`${TWILIO_SID}:${TWILIO_TOKEN}`).toString('base64');
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
          To: ALERT_PHONE,
          From: TWILIO_FROM,
          Body: body
        })
      }
    );

    if (res.ok) {
      console.log(`[SMS] ✅ Alert sent: ${severity} — ${faultType}`);
      return true;
    } else {
      const err = await res.text();
      console.error(`[SMS] ❌ Failed:`, err);
      return false;
    }
  } catch (e) {
    console.error('[SMS] Network error:', e.message);
    return false;
  }
}

module.exports = { sendSMSAlert };
