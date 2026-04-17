const express = require('express');
const { body, query, validationResult } = require('express-validator');
const router = express.Router();
const restaurantController = require('../controllers/restaurantController');
const { verifyToken, authorize } = require('../middleware/auth');

/**
 * POST /api/restaurants
 * Create new restaurant (restaurant_admin only)
 */
router.post(
  '/',
  verifyToken,
  authorize(['restaurant_admin']),
  [
    body('name').trim().isLength({ min: 3, max: 255 }).withMessage('Name must be 3-255 chars'),
    body('email').isEmail().normalizeEmail(),
    body('phone').optional().isMobilePhone(),
    body('description').optional().trim(),
    body('address').optional().trim(),
    body('city').optional().trim(),
    body('zipCode').optional().trim(),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          errors: errors.array(),
        });
      }

      const restaurant = await restaurantController.createRestaurant(req.user.id, req.body);

      res.status(201).json({
        success: true,
        code: 'RESTAURANT_CREATED',
        message: 'Restaurant created successfully',
        data: restaurant,
      });
    } catch (error) {
      const statusCode = error.statusCode || 500;
      res.status(statusCode).json({
        success: false,
        code: error.code || 'INTERNAL_ERROR',
        message: error.message || 'An error occurred',
      });
    }
  }
);

/**
 * GET /api/restaurants/:id
 * Get restaurant by ID (public)
 */
router.get('/:id', async (req, res) => {
  try {
    const restaurant = await restaurantController.getRestaurant(req.params.id);

    res.json({
      success: true,
      data: restaurant,
    });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    res.status(statusCode).json({
      success: false,
      code: error.code || 'INTERNAL_ERROR',
      message: error.message || 'An error occurred',
    });
  }
});

/**
 * GET /api/restaurants
 * List restaurants with filters (public)
 */
router.get(
  '/',
  [
    query('city').optional().trim(),
    query('search').optional().trim(),
    query('isApproved').optional().isBoolean(),
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
          message: 'Validation failed',
          errors: errors.array(),
        });
      }

      const filters = {
        city: req.query.city,
        isApproved: req.query.isApproved === 'true',
        search: req.query.search,
        limit: req.query.limit || 20,
        offset: req.query.offset || 0,
      };

      const result = await restaurantController.listRestaurants(filters);

      res.json({
        success: true,
        data: result.rows,
        meta: { total: result.count, limit: filters.limit, offset: filters.offset },
      });
    } catch (error) {
      const statusCode = error.statusCode || 500;
      res.status(statusCode).json({
        success: false,
        code: error.code || 'INTERNAL_ERROR',
        message: error.message || 'An error occurred',
      });
    }
  }
);

/**
 * GET /api/my-restaurants
 * Get restaurants owned by current user (restaurant_admin)
 */
router.get(
  '/my-restaurants',
  verifyToken,
  authorize(['restaurant_admin']),
  [
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
          message: 'Validation failed',
          errors: errors.array(),
        });
      }

      const result = await restaurantController.getRestaurantsByOwner(
        req.user.id,
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
        message: error.message || 'An error occurred',
      });
    }
  }
);

/**
 * PUT /api/restaurants/:id
 * Update restaurant (owner only)
 */
router.put(
  '/:id',
  verifyToken,
  authorize(['restaurant_admin']),
  [
    body('name').optional().trim().isLength({ min: 3, max: 255 }),
    body('phone').optional().isMobilePhone(),
    body('description').optional().trim(),
    body('address').optional().trim(),
    body('city').optional().trim(),
    body('zipCode').optional().trim(),
    body('latitude').optional().isFloat(),
    body('longitude').optional().isFloat(),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          errors: errors.array(),
        });
      }

      const restaurant = await restaurantController.updateRestaurant(
        req.params.id,
        req.user.id,
        req.body
      );

      res.json({
        success: true,
        message: 'Restaurant updated successfully',
        data: restaurant,
      });
    } catch (error) {
      const statusCode = error.statusCode || 500;
      res.status(statusCode).json({
        success: false,
        code: error.code || 'INTERNAL_ERROR',
        message: error.message || 'An error occurred',
      });
    }
  }
);

/**
 * PUT /api/restaurants/:id/operating-hours
 * Update operating hours (owner only)
 */
router.put(
  '/:id/operating-hours',
  verifyToken,
  authorize(['restaurant_admin']),
  [body('*').custom((value) => {
    if (!value || typeof value !== 'object') {
      throw new Error('Operating hours must be an object');
    }
    return true;
  })],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          errors: errors.array(),
        });
      }

      const restaurant = await restaurantController.updateOperatingHours(
        req.params.id,
        req.user.id,
        req.body
      );

      res.json({
        success: true,
        message: 'Operating hours updated successfully',
        data: restaurant,
      });
    } catch (error) {
      const statusCode = error.statusCode || 500;
      res.status(statusCode).json({
        success: false,
        code: error.code || 'INTERNAL_ERROR',
        message: error.message || 'An error occurred',
      });
    }
  }
);

/**
 * PUT /api/restaurants/:id/delivery-settings
 * Update delivery settings (owner only)
 */
router.put(
  '/:id/delivery-settings',
  verifyToken,
  authorize(['restaurant_admin']),
  [
    body('deliveryEnabled').optional().isBoolean(),
    body('pickupEnabled').optional().isBoolean(),
    body('defaultDeliveryFee').optional().isFloat({ min: 0 }),
    body('minOrderForDelivery').optional().isFloat({ min: 0 }),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          errors: errors.array(),
        });
      }

      const restaurant = await restaurantController.updateDeliverySettings(
        req.params.id,
        req.user.id,
        req.body
      );

      res.json({
        success: true,
        message: 'Delivery settings updated successfully',
        data: restaurant,
      });
    } catch (error) {
      const statusCode = error.statusCode || 500;
      res.status(statusCode).json({
        success: false,
        code: error.code || 'INTERNAL_ERROR',
        message: error.message || 'An error occurred',
      });
    }
  }
);

/**
 * PUT /api/restaurants/:id/bank-details
 * Update bank details (owner only)
 */
router.put(
  '/:id/bank-details',
  verifyToken,
  authorize(['restaurant_admin']),
  [
    body('bankAccountName').optional().trim(),
    body('bankAccountNumber').optional().trim(),
    body('bankIFSC').optional().trim(),
    body('upiId').optional().trim(),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          errors: errors.array(),
        });
      }

      const restaurant = await restaurantController.updateBankDetails(
        req.params.id,
        req.user.id,
        req.body
      );

      res.json({
        success: true,
        message: 'Bank details updated successfully',
        data: restaurant,
      });
    } catch (error) {
      const statusCode = error.statusCode || 500;
      res.status(statusCode).json({
        success: false,
        code: error.code || 'INTERNAL_ERROR',
        message: error.message || 'An error occurred',
      });
    }
  }
);

// ===== Admin endpoints =====

/**
 * PUT /api/admin/restaurants/:id/approve
 * Approve restaurant (system_admin only)
 */
router.put(
  '/admin/:id/approve',
  verifyToken,
  authorize(['system_admin']),
  [body('notes').optional().trim()],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          errors: errors.array(),
        });
      }

      const restaurant = await restaurantController.approveRestaurant(
        req.params.id,
        req.user.id,
        req.body.notes
      );

      res.json({
        success: true,
        message: 'Restaurant approved successfully',
        data: restaurant,
      });
    } catch (error) {
      const statusCode = error.statusCode || 500;
      res.status(statusCode).json({
        success: false,
        code: error.code || 'INTERNAL_ERROR',
        message: error.message || 'An error occurred',
      });
    }
  }
);

/**
 * PUT /api/admin/restaurants/:id/reject
 * Reject restaurant (system_admin only)
 */
router.put(
  '/admin/:id/reject',
  verifyToken,
  authorize(['system_admin']),
  [body('notes').optional().trim()],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          errors: errors.array(),
        });
      }

      const restaurant = await restaurantController.rejectRestaurant(
        req.params.id,
        req.user.id,
        req.body.notes
      );

      res.json({
        success: true,
        message: 'Restaurant rejected successfully',
        data: restaurant,
      });
    } catch (error) {
      const statusCode = error.statusCode || 500;
      res.status(statusCode).json({
        success: false,
        code: error.code || 'INTERNAL_ERROR',
        message: error.message || 'An error occurred',
      });
    }
  }
);

module.exports = router;
