const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
const router = express.Router();
const adminController = require('../controllers/adminController');
const changeRequestController = require('../controllers/changeRequestController');
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

/**
 * GET /api/admin/riders?status=pending|approved|suspended
 * Delivery partners with per-status counts and completed deliveries
 */
router.get(
  '/riders',
  [query('status').optional().isIn(['pending', 'approved', 'suspended'])],
  handle(async (req, res) => {
    const result = await adminController.listRiders(req.query);
    res.json({ success: true, data: result.riders, meta: { counts: result.counts } });
  })
);

/**
 * PUT /api/admin/riders/:id/approve | suspend
 */
for (const [action, status] of [
  ['approve', 'approved'],
  ['suspend', 'suspended'],
]) {
  router.put(
    `/riders/:id/${action}`,
    [param('id').isUUID()],
    handle(async (req, res) => {
      res.json({ success: true, data: await adminController.setRiderStatus(req.params.id, status) });
    })
  );
}

/**
 * GET /api/admin/riders/:id/cash
 * Balance, recent cash orders and settlements for one rider
 */
router.get(
  '/riders/:id/cash',
  [param('id').isUUID()],
  handle(async (req, res) => {
    res.json({ success: true, data: await adminController.getRiderCash(req.params.id) });
  })
);

/**
 * POST /api/admin/riders/:id/settlements
 * Body: { kind: 'payment' | 'write_off', amount, note? } (note required for write-offs)
 */
router.post(
  '/riders/:id/settlements',
  [
    param('id').isUUID(),
    body('kind').isIn(['payment', 'write_off']),
    body('amount').isFloat({ gt: 0 }),
    body('note').optional().isString().trim().isLength({ max: 500 }),
  ],
  handle(async (req, res) => {
    res.status(201).json({
      success: true,
      data: await adminController.addSettlement(req.params.id, req.user.id, req.body),
    });
  })
);

/**
 * POST /api/admin/orders/:id/resolve-payment
 * Body: { outcome: 'collected' | 'written_off', method?: 'cash' | 'upi', note }
 */
router.post(
  '/orders/:id/resolve-payment',
  [
    param('id').isUUID(),
    body('outcome').isIn(['collected', 'written_off']),
    body('method').optional().isIn(['cash', 'upi']),
    body('note').isString().trim().isLength({ min: 1, max: 500 }),
  ],
  handle(async (req, res) => {
    res.json({ success: true, data: await adminController.resolvePayment(req.params.id, req.user.id, req.body) });
  })
);

/**
 * GET /api/admin/change-requests?status=pending|approved|rejected|all
 * Payout and personal detail changes from approved restaurants and riders, with the current values
 */
router.get(
  '/change-requests',
  [query('status').optional().isIn(['pending', 'approved', 'rejected', 'all'])],
  handle(async (req, res) => {
    res.json({ success: true, data: await changeRequestController.listRequests(req.query) });
  })
);

/**
 * POST /api/admin/change-requests/:id/approve   Body: { note? }
 * POST /api/admin/change-requests/:id/reject    Body: { note }, shown to the restaurant or rider
 */
router.post(
  '/change-requests/:id/approve',
  [param('id').isUUID(), body('note').optional().isString().trim().isLength({ max: 500 })],
  handle(async (req, res) => {
    res.json({
      success: true,
      data: await changeRequestController.approveRequest(req.params.id, req.user.id, req.body.note),
    });
  })
);

router.post(
  '/change-requests/:id/reject',
  [param('id').isUUID(), body('note').isString().trim().isLength({ min: 1, max: 500 }).withMessage('Say why')],
  handle(async (req, res) => {
    res.json({
      success: true,
      data: await changeRequestController.rejectRequest(req.params.id, req.user.id, req.body.note),
    });
  })
);

module.exports = router;
