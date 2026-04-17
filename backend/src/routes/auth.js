const express = require('express');
const { body, validationResult } = require('express-validator');
const router = express.Router();
const userController = require('../controllers/userController');
const { verifyToken } = require('../middleware/auth');
const { generateAccessToken } = require('../utils/tokenUtils');
const jwt = require('jsonwebtoken');
const config = require('../config');

/**
 * POST /api/auth/register
 * Register a new user
 * Body: { email, password, firstName, lastName }
 */
router.post(
  '/register',
  [
    body('email').trim().isEmail().normalizeEmail(),
    body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
    body('firstName').optional().trim().notEmpty(),
    body('lastName').optional().trim().notEmpty(),
  ],
  async (req, res) => {
    try {
      // Check validation errors
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          errors: errors.array().map(err => ({
            field: err.param,
            message: err.msg,
          })),
        });
      }

      const result = await userController.registerUser({
        email: req.body.email,
        password: req.body.password,
        firstName: req.body.firstName,
        lastName: req.body.lastName,
        role: req.body.role || 'customer',
      });

      res.status(201).json({
        success: true,
        message: 'User registered successfully',
        data: {
          user: result.user,
          accessToken: result.accessToken,
          refreshToken: result.refreshToken,
        },
      });
    } catch (error) {
      const statusCode = error.statusCode || 500;
      const code = error.code || 'INTERNAL_ERROR';
      const message = error.message || 'An error occurred during registration';

      res.status(statusCode).json({
        success: false,
        code,
        message,
      });
    }
  }
);

/**
 * POST /api/auth/login
 * Authenticate user and return JWT tokens
 * Body: { email, password }
 */
router.post(
  '/login',
  [
    body('email').trim().isEmail().normalizeEmail(),
    body('password').notEmpty().withMessage('Password is required'),
  ],
  async (req, res) => {
    try {
      // Check validation errors
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          errors: errors.array().map(err => ({
            field: err.param,
            message: err.msg,
          })),
        });
      }

      const result = await userController.loginUser({
        email: req.body.email,
        password: req.body.password,
      });

      res.status(200).json({
        success: true,
        message: 'Login successful',
        data: {
          user: result.user,
          accessToken: result.accessToken,
          refreshToken: result.refreshToken,
        },
      });
    } catch (error) {
      const statusCode = error.statusCode || 500;
      const code = error.code || 'INTERNAL_ERROR';
      const message = error.message || 'An error occurred during login';

      res.status(statusCode).json({
        success: false,
        code,
        message,
      });
    }
  }
);

/**
 * POST /api/auth/refresh
 * Refresh access token using refresh token
 * Body: { refreshToken }
 */
router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({
        success: false,
        code: 'VALIDATION_ERROR',
        message: 'Refresh token is required',
      });
    }

    // Verify refresh token
    let decoded;
    try {
      decoded = jwt.verify(refreshToken, config.jwt.refreshSecret);
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({
          success: false,
          code: 'TOKEN_EXPIRED',
          message: 'Refresh token has expired',
        });
      }
      return res.status(401).json({
        success: false,
        code: 'INVALID_TOKEN',
        message: 'Invalid refresh token',
      });
    }

    // Get user
    const user = await userController.getUserById(decoded.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        code: 'USER_NOT_FOUND',
        message: 'User not found',
      });
    }

    // Generate new access token
    const accessToken = generateAccessToken({
      id: user.id,
      email: user.email,
      role: user.role,
    });

    res.status(200).json({
      success: true,
      message: 'Token refreshed successfully',
      data: {
        accessToken,
      },
    });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    const code = error.code || 'INTERNAL_ERROR';
    const message = error.message || 'An error occurred during token refresh';

    res.status(statusCode).json({
      success: false,
      code,
      message,
    });
  }
});

/**
 * POST /api/auth/logout
 * Logout user (currently just returns success - token blacklist can be added later)
 * Headers: Authorization: Bearer <token>
 */
router.post('/logout', verifyToken, async (req, res) => {
  try {
    // In a real implementation, you would:
    // 1. Add the token to a blacklist in Redis
    // 2. Set expiration equal to token expiry
    // For now, just return success (client should delete token)

    res.status(200).json({
      success: true,
      message: 'Logout successful. Please delete the token on client side.',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      code: 'INTERNAL_ERROR',
      message: 'An error occurred during logout',
    });
  }
});

/**
 * GET /api/auth/me
 * Get current user profile
 * Headers: Authorization: Bearer <token>
 */
router.get('/me', verifyToken, async (req, res) => {
  try {
    const user = await userController.getCurrentUser(req.user.id);
    res.status(200).json({
      success: true,
      message: 'User profile retrieved',
      data: {
        user: user.toJSON(),
      },
    });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    const code = error.code || 'INTERNAL_ERROR';
    const message = error.message || 'An error occurred';

    res.status(statusCode).json({
      success: false,
      code,
      message,
    });
  }
});

module.exports = router;

