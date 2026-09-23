/* eslint-disable no-console */
const { runAutoReady } = require('../controllers/kitchenController');

const INTERVAL_MS = parseInt(process.env.AUTO_READY_INTERVAL_MS || '60000', 10);

// Runs inside the API process. With more than one API instance, run it in only one
// (set AUTO_READY_JOB=false on the others).
const startAutoReadyJob = () => {
  if (process.env.AUTO_READY_JOB === 'false') return null;
  const tick = async () => {
    try {
      const marked = await runAutoReady();
      if (marked) console.info(`Auto-ready: ${marked} order(s) marked ready`);
    } catch (error) {
      console.error('Auto-ready failed:', error.message);
    }
  };
  return setInterval(tick, INTERVAL_MS);
};

module.exports = { startAutoReadyJob };
