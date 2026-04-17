const express = require('express');
const router = express.Router();

// Placeholder for auth routes - will be implemented in Phase 1B
router.post('/register', (req, res) => {
  res.status(501).json({
    success: false,
    message: 'Register endpoint - coming in Phase 1B',
    code: 'NOT_IMPLEMENTED'
  });
});

router.post('/login', (req, res) => {
  res.status(501).json({
    success: false,
    message: 'Login endpoint - coming in Phase 1B',
    code: 'NOT_IMPLEMENTED'
  });
});

module.exports = router;
