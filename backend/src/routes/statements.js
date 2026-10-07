const express = require('express');
const { query, validationResult } = require('express-validator');
const router = express.Router();
const { buildStatement } = require('../controllers/statementController');
const { verifyToken, authorize } = require('../middleware/auth');

const day = (field) =>
  query(field).isISO8601({ strict: true }).isLength({ min: 10, max: 10 }).withMessage('Use a date like 2026-09-30');

/**
 * GET /api/statements?from=YYYY-MM-DD&to=YYYY-MM-DD[&restaurantId=]
 * The signed-in user's orders over a period (at most a year) as a CSV file.
 * Customers: orders placed. Partners: their restaurants' orders. Riders: orders delivered.
 */
router.get(
  '/',
  verifyToken,
  authorize(['customer', 'restaurant_admin', 'delivery_partner']),
  [day('from'), day('to'), query('restaurantId').optional().isUUID()],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, code: 'VALIDATION_ERROR', errors: errors.array() });
    }
    try {
      const { csv, fileName } = await buildStatement(req.user, req.query);
      res.set({
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Cache-Control': 'no-store',
      });
      // A byte order mark, so Excel reads names in any script as UTF-8
      res.send(`\uFEFF${csv}`);
    } catch (error) {
      res.status(error.statusCode || 500).json({
        success: false,
        code: error.code || 'INTERNAL_ERROR',
        message: error.message,
      });
    }
  }
);

module.exports = router;
