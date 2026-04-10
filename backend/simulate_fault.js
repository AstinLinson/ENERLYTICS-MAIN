const fetch = require('node-fetch');

async function triggerFault() {
  console.log("🚀 Injecting CRITICAL fault into the Smart Grid...");
  
  const badData = {
    voltage: 285.5,    // Spike way above 240V norm
    current: 45.2,     // Short circuit level
    temperature: 95.0, // Overheating
    power: 12904.6
  };

  try {
    const res = await fetch('http://localhost:3000/smartgrid-data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(badData)
    });
    
    if (res.ok) {
      console.log("✅ Fault injected successfully. Watch your phone!");
    } else {
      console.log("❌ Failed to inject fault:", res.statusText);
    }
  } catch (err) {
    console.error("❌ Error connecting to backend:", err.message);
  }
}

triggerFault();
