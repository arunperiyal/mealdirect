/* eslint-disable no-console */
const { runAutoAssign } = require('../controllers/autoAcceptController');

const INTERVAL_MS = parseInt(process.env.AUTO_ASSIGN_INTERVAL_MS || '60000', 10);

// Gives waiting orders to riders' auto-accept rules: orders a rider gave back, and riders
// who finished a delivery and have room again. Accepting orders also runs it at once.
// With more than one API instance, run it in only one (AUTO_ASSIGN_JOB=false on the others).
const startAutoAssignJob = () => {
  if (process.env.AUTO_ASSIGN_JOB === 'false') return null;
  const tick = async () => {
    try {
      const assigned = await runAutoAssign();
      if (assigned) console.info(`Auto-accept: ${assigned} order(s) given to riders`);
    } catch (error) {
      console.error('Auto-accept failed:', error.message);
    }
  };
  return setInterval(tick, INTERVAL_MS);
};

module.exports = { startAutoAssignJob };
