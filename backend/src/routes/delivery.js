const express = require('express');
const { body, param, validationResult } = require('express-validator');
const router = express.Router();
const deliveryController = require('../controllers/deliveryController');
const { verifyToken, authorize } = require('../middleware/auth');

const fail = (res, error) =>
  res.status(error.statusCode || 500).json({
    success: false,
    code: error.code || 'INTERNAL_ERROR',
    message: error.message,
  });

// Approved delivery partners only
router.use(verifyToken, authorize(['delivery_partner']), async (req, res, next) => {
  try {
    await deliveryController.assertApprovedRider(req.user.id);
    next();
  } catch (error) {
    fail(res, error);
  }
});

const handle = (fn) => async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, code: 'VALIDATION_ERROR', errors: errors.array() });
  }
  try {
    res.json({ success: true, data: await fn(req) });
  } catch (error) {
    fail(res, error);
  }
};

const orderId = [param('id').isUUID()];

/** GET /api/delivery/available: unclaimed delivery orders */
router.get('/available', handle(() => deliveryController.listAvailable()));

/** GET /api/delivery/balance: cash held, overdue and collected today */
router.get('/balance', handle((req) => deliveryController.balance(req.user.id)));

/** GET /api/delivery/orders: this rider's deliveries */
router.get('/orders', handle((req) => deliveryController.listMine(req.user.id)));

/** GET /api/delivery/orders/:id */
router.get('/orders/:id', orderId, handle((req) => deliveryController.getOrder(req.params.id, req.user.id)));

/** POST /api/delivery/orders/:id/claim | release | pick-up | deliver */
router.post('/orders/:id/claim', orderId, handle((req) => deliveryController.claim(req.params.id, req.user.id)));
router.post('/orders/:id/release', orderId, handle((req) => deliveryController.release(req.params.id, req.user.id)));
router.post('/orders/:id/pick-up', orderId, handle((req) => deliveryController.pickUp(req.params.id, req.user.id)));
// Body for pay-on-delivery orders: { collection: 'cash' | 'upi' | 'not_paid', note? }
router.post(
  '/orders/:id/deliver',
  [
    ...orderId,
    body('collection').optional().isIn(['cash', 'upi', 'not_paid']),
    body('note').optional().isString().trim().isLength({ max: 500 }),
  ],
  handle((req) => deliveryController.deliver(req.params.id, req.user.id, req.body))
);

module.exports = router;
