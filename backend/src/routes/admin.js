const express = require('express');
const { param, query, validationResult } = require('express-validator');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { verifyToken, authorize } = require('../middleware/auth');

// Everything here is for system admins
router.use(verifyToken, authorize(['system_admin']));

const handle = (fn) => async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, code: 'VALIDATION_ERROR', errors: errors.array() });
  }
  try {
    await fn(req, res);
  } catch (error) {
    res.status(error.statusCode || 500).json({
      success: false,
      code: error.code || 'INTERNAL_ERROR',
      message: error.message,
    });
  }
};

/**
 * GET /api/admin/restaurants
 * All restaurants with owner contact details, filtered by review status
 */
router.get(
  '/restaurants',
  [
    query('status').optional().isIn(['pending', 'verified', 'rejected']),
    query('search').optional().trim(),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
    query('offset').optional().isInt({ min: 0 }).toInt(),
  ],
  handle(async (req, res) => {
    const result = await adminController.listRestaurants(req.query);
    res.json({ success: true, data: result.rows, meta: { total: result.count, counts: result.counts } });
  })
);

/**
 * GET /api/admin/restaurants/:id
 * One restaurant with its owner and order stats
 */
router.get(
  '/restaurants/:id',
  [param('id').isUUID()],
  handle(async (req, res) => {
    res.json({ success: true, data: await adminController.getRestaurant(req.params.id) });
  })
);

/**
 * GET /api/admin/analytics?days=30&tzOffset=330
 * Orders and sales by day, top restaurants, customers and platform counts.
 * tzOffset: minutes east of UTC for grouping days (330 = India).
 */
router.get(
  '/analytics',
  [
    query('days').optional().isInt({ min: 1, max: 366 }).toInt(),
    query('tzOffset').optional().isInt({ min: -720, max: 840 }).toInt(),
  ],
  handle(async (req, res) => {
    const data = await adminController.getAnalytics({
      days: req.query.days ?? 30,
      tzOffset: req.query.tzOffset ?? 0,
    });
    res.json({ success: true, data });
  })
);

module.exports = router;
