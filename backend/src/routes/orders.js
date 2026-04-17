const express = require('express');
const { body, query, param, validationResult } = require('express-validator');
const router = express.Router();
const orderController = require('../controllers/orderController');
const { verifyToken, authorize } = require('../middleware/auth');

/**
 * POST /api/orders
 * Create new order (customer only)
 */
router.post(
  '/',
  verifyToken,
  authorize(['customer']),
  [
    body('restaurantId').isUUID(),
    body('menuId').isUUID(),
    body('items').isArray({ min: 1 }),
    body('deliveryType').isIn(['delivery', 'pickup']),
    body('deliverySlotId').optional().isUUID(),
    body('deliveryAddress').optional().trim(),
    body('paymentMethod').isIn(['credit_card', 'cod']),
    body('customerNotes').optional().trim(),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          code: 'VALIDATION_ERROR',
          errors: errors.array(),
        });
      }

      const order = await orderController.createOrder(req.user.id, req.body);

      res.status(201).json({
        success: true,
        message: 'Order created successfully',
        data: order,
      });
    } catch (error) {
      const statusCode = error.statusCode || 500;
      res.status(statusCode).json({
        success: false,
        code: error.code || 'INTERNAL_ERROR',
        message: error.message,
      });
    }
  }
);

/**
 * GET /api/orders/:id
 * Get order by ID
 */
router.get(
  '/:id',
  verifyToken,
  [param('id').isUUID()],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          code: 'VALIDATION_ERROR',
          errors: errors.array(),
        });
      }

      const order = await orderController.getOrder(req.params.id, req.user.id, req.user.role);

      res.json({
        success: true,
        data: order,
      });
    } catch (error) {
      const statusCode = error.statusCode || 500;
      res.status(statusCode).json({
        success: false,
        code: error.code || 'INTERNAL_ERROR',
        message: error.message,
      });
    }
  }
);

/**
 * GET /api/my-orders
 * List customer's orders
 */
router.get(
  '/',
  verifyToken,
  authorize(['customer']),
  [
    query('status').optional().isIn(['pending', 'confirmed', 'preparing', 'ready', 'delivered', 'picked_up', 'cancelled']),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('offset').optional().isInt({ min: 0 }),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          code: 'VALIDATION_ERROR',
          errors: errors.array(),
        });
      }

      const result = await orderController.listCustomerOrders(req.user.id, {
        status: req.query.status,
        limit: req.query.limit || 20,
        offset: req.query.offset || 0,
      });

      res.json({
        success: true,
        data: result.rows,
        meta: { total: result.count },
      });
    } catch (error) {
      const statusCode = error.statusCode || 500;
      res.status(statusCode).json({
        success: false,
        code: error.code || 'INTERNAL_ERROR',
        message: error.message,
      });
    }
  }
);

/**
 * GET /api/restaurant-orders
 * List restaurant's incoming orders
 */
router.get(
  '/restaurant-orders',
  verifyToken,
  authorize(['restaurant_admin']),
  [
    query('status').optional(),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('offset').optional().isInt({ min: 0 }),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          code: 'VALIDATION_ERROR',
          errors: errors.array(),
        });
      }

      // For now, use user.id as restaurantId (in production, look up restaurant by owner)
      const result = await orderController.listRestaurantOrders(req.user.id, {
        status: req.query.status,
        limit: req.query.limit || 20,
        offset: req.query.offset || 0,
      });

      res.json({
        success: true,
        data: result.rows,
        meta: { total: result.count },
      });
    } catch (error) {
      const statusCode = error.statusCode || 500;
      res.status(statusCode).json({
        success: false,
        code: error.code || 'INTERNAL_ERROR',
        message: error.message,
      });
    }
  }
);

/**
 * GET /api/admin/orders
 * List all orders (admin only)
 */
router.get(
  '/admin/orders',
  verifyToken,
  authorize(['system_admin']),
  [
    query('status').optional(),
    query('restaurantId').optional().isUUID(),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('offset').optional().isInt({ min: 0 }),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          code: 'VALIDATION_ERROR',
          errors: errors.array(),
        });
      }

      const result = await orderController.listAdminOrders({
        status: req.query.status,
        restaurantId: req.query.restaurantId,
        limit: req.query.limit || 20,
        offset: req.query.offset || 0,
      });

      res.json({
        success: true,
        data: result.rows,
        meta: { total: result.count },
      });
    } catch (error) {
      const statusCode = error.statusCode || 500;
      res.status(statusCode).json({
        success: false,
        code: error.code || 'INTERNAL_ERROR',
        message: error.message,
      });
    }
  }
);

/**
 * POST /api/orders/:id/confirm
 * Confirm order (restaurant only)
 */
router.post(
  '/:id/confirm',
  verifyToken,
  authorize(['restaurant_admin']),
  [param('id').isUUID()],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          code: 'VALIDATION_ERROR',
          errors: errors.array(),
        });
      }

      const order = await orderController.confirmOrder(req.params.id, req.user.id, req.user.id);

      res.json({
        success: true,
        message: 'Order confirmed successfully',
        data: order,
      });
    } catch (error) {
      const statusCode = error.statusCode || 500;
      res.status(statusCode).json({
        success: false,
        code: error.code || 'INTERNAL_ERROR',
        message: error.message,
      });
    }
  }
);

/**
 * POST /api/orders/:id/mark-preparing
 * Mark order as preparing (restaurant only)
 */
router.post(
  '/:id/mark-preparing',
  verifyToken,
  authorize(['restaurant_admin']),
  [param('id').isUUID()],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          code: 'VALIDATION_ERROR',
          errors: errors.array(),
        });
      }

      const order = await orderController.markPreparing(req.params.id, req.user.id, req.user.id);

      res.json({
        success: true,
        message: 'Order marked as preparing',
        data: order,
      });
    } catch (error) {
      const statusCode = error.statusCode || 500;
      res.status(statusCode).json({
        success: false,
        code: error.code || 'INTERNAL_ERROR',
        message: error.message,
      });
    }
  }
);

/**
 * POST /api/orders/:id/mark-ready
 * Mark order as ready (restaurant only)
 */
router.post(
  '/:id/mark-ready',
  verifyToken,
  authorize(['restaurant_admin']),
  [param('id').isUUID()],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          code: 'VALIDATION_ERROR',
          errors: errors.array(),
        });
      }

      const order = await orderController.markReady(req.params.id, req.user.id, req.user.id);

      res.json({
        success: true,
        message: 'Order marked as ready',
        data: order,
      });
    } catch (error) {
      const statusCode = error.statusCode || 500;
      res.status(statusCode).json({
        success: false,
        code: error.code || 'INTERNAL_ERROR',
        message: error.message,
      });
    }
  }
);

/**
 * POST /api/orders/:id/mark-delivered
 * Mark order as delivered (restaurant/delivery person)
 */
router.post(
  '/:id/mark-delivered',
  verifyToken,
  authorize(['restaurant_admin']),
  [param('id').isUUID()],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          code: 'VALIDATION_ERROR',
          errors: errors.array(),
        });
      }

      const order = await orderController.markDelivered(req.params.id, req.user.id, req.user.id);

      res.json({
        success: true,
        message: 'Order marked as delivered',
        data: order,
      });
    } catch (error) {
      const statusCode = error.statusCode || 500;
      res.status(statusCode).json({
        success: false,
        code: error.code || 'INTERNAL_ERROR',
        message: error.message,
      });
    }
  }
);

/**
 * POST /api/orders/:id/mark-picked-up
 * Mark order as picked up (customer)
 */
router.post(
  '/:id/mark-picked-up',
  verifyToken,
  authorize(['customer']),
  [param('id').isUUID()],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          code: 'VALIDATION_ERROR',
          errors: errors.array(),
        });
      }

      const order = await orderController.markPickedUp(req.params.id, req.user.id, req.user.id);

      res.json({
        success: true,
        message: 'Order marked as picked up',
        data: order,
      });
    } catch (error) {
      const statusCode = error.statusCode || 500;
      res.status(statusCode).json({
        success: false,
        code: error.code || 'INTERNAL_ERROR',
        message: error.message,
      });
    }
  }
);

/**
 * POST /api/orders/:id/cancel
 * Cancel order
 */
router.post(
  '/:id/cancel',
  verifyToken,
  [
    param('id').isUUID(),
    body('reason').optional().trim(),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          code: 'VALIDATION_ERROR',
          errors: errors.array(),
        });
      }

      const order = await orderController.cancelOrder(
        req.params.id,
        req.user.id,
        req.user.role,
        req.body.reason
      );

      res.json({
        success: true,
        message: 'Order cancelled successfully',
        data: order,
      });
    } catch (error) {
      const statusCode = error.statusCode || 500;
      res.status(statusCode).json({
        success: false,
        code: error.code || 'INTERNAL_ERROR',
        message: error.message,
      });
    }
  }
);

/**
 * PUT /api/orders/:id
 * Update order (customer only, before confirmation)
 */
router.put(
  '/:id',
  verifyToken,
  authorize(['customer']),
  [
    param('id').isUUID(),
    body('customerNotes').optional().trim(),
    body('deliveryAddress').optional().trim(),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          code: 'VALIDATION_ERROR',
          errors: errors.array(),
        });
      }

      const order = await orderController.updateOrder(req.params.id, req.user.id, req.body);

      res.json({
        success: true,
        message: 'Order updated successfully',
        data: order,
      });
    } catch (error) {
      const statusCode = error.statusCode || 500;
      res.status(statusCode).json({
        success: false,
        code: error.code || 'INTERNAL_ERROR',
        message: error.message,
      });
    }
  }
);

module.exports = router;
