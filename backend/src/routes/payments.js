const express = require('express');
const { body, param, validationResult } = require('express-validator');
const router = express.Router();
const paymentController = require('../controllers/paymentController');
const { verifyToken, authorize } = require('../middleware/auth');

const sendError = (res, error) => {
  const statusCode = error.statusCode || 500;
  res.status(statusCode).json({
    success: false,
    code: error.code || 'INTERNAL_ERROR',
    message: error.message,
  });
};

const sendValidationErrors = (req, res) => {
  const errors = validationResult(req);
  if (errors.isEmpty()) return false;
  res.status(400).json({
    success: false,
    code: 'VALIDATION_ERROR',
    errors: errors.array(),
  });
  return true;
};

/**
 * POST /api/payments/create-order
 * Create a Razorpay order for an online-payment order (customer only)
 */
router.post(
  '/create-order',
  verifyToken,
  authorize(['customer']),
  [body('orderId').isUUID()],
  async (req, res) => {
    try {
      if (sendValidationErrors(req, res)) return;

      const data = await paymentController.createPaymentOrder(req.user.id, req.body.orderId);

      res.status(201).json({
        success: true,
        message: 'Payment order created',
        data,
      });
    } catch (error) {
      sendError(res, error);
    }
  }
);

/**
 * POST /api/payments/verify-payment
 * Verify the signature returned by Razorpay Checkout (customer only)
 */
router.post(
  '/verify-payment',
  verifyToken,
  authorize(['customer']),
  [
    body('razorpay_order_id').isString().notEmpty(),
    body('razorpay_payment_id').isString().notEmpty(),
    body('razorpay_signature').isString().notEmpty(),
  ],
  async (req, res) => {
    try {
      if (sendValidationErrors(req, res)) return;

      const data = await paymentController.verifyPayment(req.user.id, {
        razorpayOrderId: req.body.razorpay_order_id,
        razorpayPaymentId: req.body.razorpay_payment_id,
        razorpaySignature: req.body.razorpay_signature,
      });

      res.json({
        success: true,
        message: 'Payment verified successfully',
        data,
      });
    } catch (error) {
      sendError(res, error);
    }
  }
);

/**
 * POST /api/payments/webhook
 * Razorpay webhook receiver. Authenticated by X-Razorpay-Signature, not JWT.
 */
router.post('/webhook', async (req, res) => {
  try {
    const result = await paymentController.handleWebhook(
      req.rawBody,
      req.headers['x-razorpay-signature'],
      req.body
    );

    // Always 200 for authentic events so Razorpay doesn't retry ignored ones
    res.json({ success: true, data: result });
  } catch (error) {
    sendError(res, error);
  }
});

/**
 * GET /api/payments/status/:orderId
 * Get payment status for an order
 */
router.get(
  '/status/:orderId',
  verifyToken,
  [param('orderId').isUUID()],
  async (req, res) => {
    try {
      if (sendValidationErrors(req, res)) return;

      const data = await paymentController.getPaymentStatus(
        req.params.orderId,
        req.user.id,
        req.user.role
      );

      res.json({
        success: true,
        data,
      });
    } catch (error) {
      sendError(res, error);
    }
  }
);

module.exports = router;
