const express = require('express');
const { body, query, param, validationResult } = require('express-validator');
const router = express.Router();
const menuController = require('../controllers/menuController');
const deliverySlotController = require('../controllers/deliverySlotController');
const { verifyToken, authorize } = require('../middleware/auth');
const { MAX_QUANTITY, MAX_DAILY_LIMIT } = require('../lib/itemLimits');
const { businessDateString } = require('../lib/businessTime');

/**
 * POST /api/menus
 * Create new menu (restaurant_admin only)
 */
router.post(
  '/',
  verifyToken,
  authorize(['restaurant_admin']),
  [
    body('restaurantId').isUUID().withMessage('Valid restaurant ID required'),
    body('date').isISO8601().toDate(),
    body('orderingStartTime').optional().isTime({ hourFormat: 'hour24' }),
    body('orderingEndTime').optional().isTime({ hourFormat: 'hour24' }),
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

      const menu = await menuController.createMenu(
        req.body.restaurantId,
        req.user.id,
        req.body
      );

      res.status(201).json({
        success: true,
        message: 'Menu created successfully',
        data: menu,
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
 * GET /api/menus/:id
 * Get menu by ID (public)
 */
router.get(
  '/:id',
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

      const menu = await menuController.getMenu(req.params.id);

      res.json({
        success: true,
        data: menu,
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
 * GET /api/menus
 * List menus with filters (public)
 */
router.get(
  '/',
  [
    query('restaurantId').optional().isUUID(),
    query('date').optional().isISO8601(),
    query('from').optional().isISO8601(),
    query('to').optional().isISO8601(),
    query('status').optional().isIn(['draft', 'published', 'closed', 'archived']),
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

      const result = await menuController.getMenusByRestaurant(
        req.query.restaurantId,
        // Default: the last 30 days up to today, in the business timezone (not UTC,
        // which is still on yesterday for the first hours of an Indian day)
        req.query.date || req.query.from || businessDateString(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)),
        req.query.date || req.query.to || businessDateString(),
        req.query.limit || 20,
        req.query.offset || 0
      );

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
 * PUT /api/menus/:id
 * Update menu (owner only, draft only)
 */
router.put(
  '/:id',
  verifyToken,
  authorize(['restaurant_admin']),
  [
    param('id').isUUID(),
    body('date').optional().isISO8601(),
    body('orderingStartTime').optional().isTime({ hourFormat: 'hour24' }),
    body('orderingEndTime').optional().isTime({ hourFormat: 'hour24' }),
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

      const menu = await menuController.updateMenu(req.params.id, req.user.id, req.body);

      res.json({
        success: true,
        message: 'Menu updated successfully',
        data: menu,
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
 * POST /api/menus/:id/publish
 * Publish menu (owner only)
 */
router.post(
  '/:id/publish',
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

      const menu = await menuController.publishMenu(req.params.id, req.user.id);

      res.json({
        success: true,
        message: 'Menu published successfully',
        data: menu,
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
 * POST /api/menus/:id/close
 * Close menu (owner only)
 */
router.post(
  '/:id/close',
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

      const menu = await menuController.closeMenu(req.params.id, req.user.id);

      res.json({
        success: true,
        message: 'Menu closed successfully',
        data: menu,
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
 * POST /api/menus/:id/items
 * Add items to menu (owner only)
 */
router.post(
  '/:id/items',
  verifyToken,
  authorize(['restaurant_admin']),
  [
    param('id').isUUID(),
    body('items').isArray({ min: 1 }),
    // Each item is a dish from the restaurant's list ({ dishId, price? }) or a one-off { name, price, ... }
    body('items.*').custom((item) => {
      if (item && typeof item === 'object' && (item.dishId || (item.name && item.price !== undefined))) return true;
      throw new Error('Each item needs a dishId, or a name and price');
    }),
    body('items.*.dishId').optional().isUUID(),
    body('items.*.name').optional().isString().trim().notEmpty().withMessage('Each item needs a name'),
    body('items.*.price').optional().isFloat({ min: 0 }).withMessage('Each item needs a price of 0 or more'),
    body('items.*.description').optional().isString().trim(),
    body('items.*.available').optional().isBoolean(),
    // Optional limits per customer; null or missing means no limit
    body('items.*.maxPerOrder').optional({ values: 'null' }).isInt({ min: 1, max: MAX_QUANTITY }).toInt()
      .withMessage(`Limit per order is 1 to ${MAX_QUANTITY}`),
    body('items.*.maxPerDay').optional({ values: 'null' }).isInt({ min: 1, max: MAX_DAILY_LIMIT }).toInt()
      .withMessage(`Limit per day is 1 to ${MAX_DAILY_LIMIT}`),
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

      const menu = await menuController.addMenuItems(
        req.params.id,
        req.user.id,
        req.body.items
      );

      res.json({
        success: true,
        message: 'Items added successfully',
        data: menu,
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
 * PUT /api/menus/:id/items/:itemId
 * Update menu item (owner only)
 */
router.put(
  '/:id/items/:itemId',
  verifyToken,
  authorize(['restaurant_admin']),
  [
    param('id').isUUID(),
    body('name').optional().trim(),
    body('description').optional().trim(),
    body('price').optional().isFloat({ min: 0 }),
    body('imageUrl').optional().isURL(),
    body('available').optional().isBoolean(),
    // null removes a limit
    body('maxPerOrder').optional({ values: 'null' }).isInt({ min: 1, max: MAX_QUANTITY }).toInt()
      .withMessage(`Limit per order is 1 to ${MAX_QUANTITY}`),
    body('maxPerDay').optional({ values: 'null' }).isInt({ min: 1, max: MAX_DAILY_LIMIT }).toInt()
      .withMessage(`Limit per day is 1 to ${MAX_DAILY_LIMIT}`),
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

      const menu = await menuController.updateMenuItem(
        req.params.id,
        req.user.id,
        req.params.itemId,
        req.body
      );

      res.json({
        success: true,
        message: 'Item updated successfully',
        data: menu,
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
 * DELETE /api/menus/:id/items/:itemId
 * Remove an item from a menu (owner only)
 */
router.delete(
  '/:id/items/:itemId',
  verifyToken,
  authorize(['restaurant_admin']),
  [param('id').isUUID(), param('itemId').notEmpty()],
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

      const menu = await menuController.removeMenuItem(req.params.id, req.user.id, req.params.itemId);

      res.json({
        success: true,
        message: 'Menu item removed successfully',
        data: menu,
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

// ===== Delivery Slots =====

/**
 * POST /api/menus/:id/slots
 * Create delivery slot (owner only)
 */
router.post(
  '/:id/slots',
  verifyToken,
  authorize(['restaurant_admin']),
  [
    param('id').isUUID(),
    body('restaurantId').optional().isUUID(),
    body('startTime')
      .notEmpty().withMessage('Start time is required')
      .matches(/^\d{2}:\d{2}$/).withMessage('Start time must be in HH:mm format'),
    body('endTime')
      .notEmpty().withMessage('End time is required')
      .matches(/^\d{2}:\d{2}$/).withMessage('End time must be in HH:mm format'),
    body('maxOrders').notEmpty().isInt({ min: 1 }),
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

      const slot = await deliverySlotController.createDeliverySlot(
        req.params.id,
        req.user.id,
        req.body
      );

      res.status(201).json({
        success: true,
        message: 'Delivery slot created successfully',
        data: slot,
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
 * GET /api/menus/:id/slots
 * Get delivery slots for menu (public)
 */
router.get(
  '/:id/slots',
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

      const slots = await deliverySlotController.getDeliverySlots(req.params.id);

      res.json({
        success: true,
        data: slots,
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
 * PUT /api/slots/:id
 * Update delivery slot (owner only)
 */
router.put(
  '/slots/:id',
  verifyToken,
  authorize(['restaurant_admin']),
  [
    param('id').isUUID(),
    body('startTime').optional().isTime({ hourFormat: 'hour24' }),
    body('endTime').optional().isTime({ hourFormat: 'hour24' }),
    body('maxOrders').optional().isInt({ min: 1 }),
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

      const slot = await deliverySlotController.updateDeliverySlot(
        req.params.id,
        req.user.id,
        req.body
      );

      res.json({
        success: true,
        message: 'Delivery slot updated successfully',
        data: slot,
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
 * DELETE /api/slots/:id
 * Delete delivery slot (owner only)
 */
router.delete(
  '/slots/:id',
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

      const result = await deliverySlotController.deleteDeliverySlot(req.params.id, req.user.id);

      res.json({
        success: true,
        message: result.message,
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
