const express = require('express');
const { body, validationResult } = require('express-validator');
const router = express.Router();
const userController = require('../controllers/userController');
const accountController = require('../controllers/accountController');
const avatarController = require('../controllers/avatarController');
const passwordResetController = require('../controllers/passwordResetController');
const emailVerificationController = require('../controllers/emailVerificationController');
const User = require('../models/User');
const { issuedBeforePasswordChange, verifyToken } = require('../middleware/auth');
const { authLimiter } = require('../middleware/rateLimit');
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
  authLimiter,
  [
    body('email').trim().isEmail().toLowerCase(),
    body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
    body('firstName').optional().trim().notEmpty(),
    body('lastName').optional().trim().notEmpty(),
    body('phone').optional().trim().isMobilePhone().withMessage('Enter a valid phone number'),
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
        phone: req.body.phone,
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
  authLimiter,
  [
    body('email').trim().isEmail().toLowerCase(),
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
router.post('/refresh', authLimiter, async (req, res) => {
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

    // Get user. A deleted account gets no new tokens, nor a session from before a password change.
    const user = await User.findByPk(decoded.id);
    if (!user) {
      return res.status(401).json({
        success: false,
        code: 'ACCOUNT_DELETED',
        message: 'This account has been deleted',
      });
    }
    if (issuedBeforePasswordChange(decoded, user)) {
      return res.status(401).json({
        success: false,
        code: 'PASSWORD_CHANGED',
        message: 'Your password was changed. Please sign in again.',
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

const sendError = (res, error) =>
  res.status(error.statusCode || 500).json({
    success: false,
    code: error.code || 'INTERNAL_ERROR',
    message: error.message,
  });

const validated = (req, res) => {
  const errors = validationResult(req);
  if (errors.isEmpty()) return true;
  res.status(400).json({ success: false, code: 'VALIDATION_ERROR', message: errors.array()[0].msg, errors: errors.array() });
  return false;
};

/**
 * POST /api/auth/verify-email   Body: { code }
 * Confirms the signed-in account's email with the 6-digit code sent at sign-up
 * (15 minutes, 5 tries). data: { user } with isVerified true.
 * POST /api/auth/verify-email/resend: a new code (409 RESEND_TOO_SOON within a minute).
 */
router.post(
  '/verify-email',
  authLimiter,
  verifyToken,
  [body('code').trim().matches(/^\d{6}$/).withMessage('Enter the 6-digit code from the email')],
  async (req, res) => {
    if (!validated(req, res)) return;
    try {
      const user = await emailVerificationController.verify(req.user.id, req.body.code);
      res.json({ success: true, data: { user: user.toJSON() } });
    } catch (error) {
      sendError(res, error);
    }
  }
);

router.post('/verify-email/resend', authLimiter, verifyToken, async (req, res) => {
  try {
    await emailVerificationController.resend(req.user.id);
    res.json({ success: true, message: 'A new code is on its way' });
  } catch (error) {
    sendError(res, error);
  }
});

/**
 * POST /api/auth/password-reset/request   Body: { email }
 * Emails a 6-digit code (15 minutes, 5 tries). Always 200, whether or not the email has an
 * account; asking again within a minute sends nothing new.
 */
router.post(
  '/password-reset/request',
  authLimiter,
  [body('email').trim().isEmail().withMessage('Enter a valid email').toLowerCase()],
  async (req, res) => {
    if (!validated(req, res)) return;
    try {
      await passwordResetController.requestReset(req.body.email);
      res.json({ success: true, message: 'If this email has an account, a code is on its way' });
    } catch (error) {
      sendError(res, error);
    }
  }
);

/**
 * POST /api/auth/password-reset/confirm   Body: { email, code, password }
 * Sets the new password; the account's other sessions end. 400 INVALID_CODE, 429 TOO_MANY_ATTEMPTS.
 */
router.post(
  '/password-reset/confirm',
  authLimiter,
  [
    body('email').trim().isEmail().withMessage('Enter a valid email').toLowerCase(),
    body('code').trim().matches(/^\d{6}$/).withMessage('Enter the 6-digit code from the email'),
    body('password').isString().isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
  ],
  async (req, res) => {
    if (!validated(req, res)) return;
    try {
      await passwordResetController.confirmReset(req.body);
      res.json({ success: true, message: 'Password changed. Sign in with your new password.' });
    } catch (error) {
      sendError(res, error);
    }
  }
);

/**
 * PUT /api/auth/me/avatar   Body: { image } (base64 JPEG, PNG or WebP, up to 1 MB)
 * DELETE /api/auth/me/avatar
 * Set or remove your profile picture. data: { user } with the new avatarUrl.
 */
router.put(
  '/me/avatar',
  verifyToken,
  [body('image').isString().notEmpty().withMessage('Choose a photo')],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, code: 'VALIDATION_ERROR', errors: errors.array() });
    }
    try {
      const user = await avatarController.setAvatar(req.user.id, req.body.image);
      res.json({ success: true, data: { user: user.toJSON() } });
    } catch (error) {
      sendError(res, error);
    }
  }
);

router.delete('/me/avatar', verifyToken, async (req, res) => {
  try {
    const user = await avatarController.removeAvatar(req.user.id);
    res.json({ success: true, data: { user: user.toJSON() } });
  } catch (error) {
    sendError(res, error);
  }
});

/**
 * DELETE /api/auth/me   Body: { password }
 * Delete your own account. It can't sign in afterwards; MealDirect support can restore it.
 * 409 while you have open orders, a not-paid order, or (riders) unsettled cash.
 */
router.delete(
  '/me',
  authLimiter,
  verifyToken,
  [body('password').isString().notEmpty().withMessage('Enter your password')],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, code: 'VALIDATION_ERROR', errors: errors.array() });
    }
    try {
      await accountController.deleteOwnAccount(req.user.id, req.body.password);
      res.json({ success: true, message: 'Account deleted' });
    } catch (error) {
      sendError(res, error);
    }
  }
);

module.exports = router;

