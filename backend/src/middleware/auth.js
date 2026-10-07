const jwt = require('jsonwebtoken');
const config = require('../config');
const User = require('../models/User');

// Tokens carry their issue time in whole seconds; a second's grace keeps the token
// from a sign-in made right after the change working
const issuedBeforePasswordChange = (decoded, user) =>
  Boolean(user.passwordChangedAt) && decoded.iat * 1000 < new Date(user.passwordChangedAt).getTime() - 1000;

/**
 * Verify JWT token from Authorization header
 */
const verifyToken = async (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'No token provided',
      code: 'NO_TOKEN'
    });
  }

  let decoded;
  try {
    decoded = jwt.verify(token, config.jwt.secret);
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Token expired',
        code: 'TOKEN_EXPIRED'
      });
    }
    return res.status(401).json({
      success: false,
      message: 'Invalid token',
      code: 'INVALID_TOKEN'
    });
  }

  // A deleted account is signed out everywhere at once, not when its tokens expire,
  // and so is every session from before a password change
  try {
    const user = await User.findByPk(decoded.id, { attributes: ['id', 'passwordChangedAt'] });
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'This account has been deleted',
        code: 'ACCOUNT_DELETED'
      });
    }
    if (issuedBeforePasswordChange(decoded, user)) {
      return res.status(401).json({
        success: false,
        message: 'Your password was changed. Please sign in again.',
        code: 'PASSWORD_CHANGED'
      });
    }
  } catch (error) {
    return next(error);
  }

  req.user = decoded;
  next();
};

/**
 * Verify refresh token
 */
const verifyRefreshToken = (req, res, next) => {
  const token = req.body.refreshToken;

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'No refresh token provided',
      code: 'NO_REFRESH_TOKEN'
    });
  }

  try {
    const decoded = jwt.verify(token, config.jwt.refreshSecret);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: 'Invalid refresh token',
      code: 'INVALID_REFRESH_TOKEN'
    });
  }
};

/**
 * Check if user has required role(s)
 */
const authorize = (requiredRoles = []) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized',
        code: 'UNAUTHORIZED'
      });
    }

    if (requiredRoles.length > 0 && !requiredRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden - insufficient permissions',
        code: 'FORBIDDEN'
      });
    }

    next();
  };
};

module.exports = {
  issuedBeforePasswordChange,
  verifyToken,
  verifyRefreshToken,
  authorize
};
