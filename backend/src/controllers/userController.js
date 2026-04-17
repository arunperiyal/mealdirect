const User = require('../models/User');
const config = require('../config');

/**
 * Register a new user
 * @param {Object} userData - { email, password, firstName, lastName, role }
 * @returns {Object} { user, accessToken, refreshToken }
 */
async function registerUser(userData) {
  const { email, password, firstName, lastName, role = 'customer' } = userData;

  // Validation
  if (!email || !password) {
    throw {
      code: 'VALIDATION_ERROR',
      message: 'Email and password are required',
      statusCode: 400,
    };
  }

  // Email format validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    throw {
      code: 'INVALID_EMAIL',
      message: 'Invalid email format',
      statusCode: 400,
    };
  }

  // Password strength validation (minimum 8 chars, at least one uppercase, one number)
  if (password.length < 8) {
    throw {
      code: 'WEAK_PASSWORD',
      message: 'Password must be at least 8 characters long',
      statusCode: 400,
    };
  }

  // Check if user already exists
  const existingUser = await User.findOne({ where: { email } });
  if (existingUser) {
    throw {
      code: 'EMAIL_EXISTS',
      message: 'User with this email already exists',
      statusCode: 409,
    };
  }

  // Validate role
  const validRoles = ['customer', 'restaurant_admin', 'system_admin'];
  if (role && !validRoles.includes(role)) {
    throw {
      code: 'INVALID_ROLE',
      message: 'Invalid role. Must be one of: customer, restaurant_admin, system_admin',
      statusCode: 400,
    };
  }

  // Create user
  const user = await User.create({
    email,
    passwordHash: password, // Will be hashed by beforeCreate hook
    firstName,
    lastName,
    role,
  });

  // Generate tokens
  const { accessToken, refreshToken } = user.generateTokens();

  return {
    user: user.toJSON(),
    accessToken,
    refreshToken,
  };
}

/**
 * Login user
 * @param {Object} credentials - { email, password }
 * @returns {Object} { user, accessToken, refreshToken }
 */
async function loginUser(credentials) {
  const { email, password } = credentials;

  // Validation
  if (!email || !password) {
    throw {
      code: 'VALIDATION_ERROR',
      message: 'Email and password are required',
      statusCode: 400,
    };
  }

  // Find user by email
  const user = await User.findOne({ where: { email } });
  if (!user) {
    throw {
      code: 'USER_NOT_FOUND',
      message: 'Invalid email or password',
      statusCode: 401,
    };
  }

  // Check if user is active
  if (!user.isActive) {
    throw {
      code: 'USER_INACTIVE',
      message: 'This account is inactive',
      statusCode: 403,
    };
  }

  // Verify password
  const isPasswordValid = await user.comparePassword(password);
  if (!isPasswordValid) {
    throw {
      code: 'INVALID_PASSWORD',
      message: 'Invalid email or password',
      statusCode: 401,
    };
  }

  // Update last login timestamp
  await user.update({ lastLoginAt: new Date() });

  // Generate tokens
  const { accessToken, refreshToken } = user.generateTokens();

  return {
    user: user.toJSON(),
    accessToken,
    refreshToken,
  };
}

/**
 * Get user by ID
 * @param {string} userId - User ID
 * @returns {Object} User object
 */
async function getUserById(userId) {
  const user = await User.findByPk(userId);
  if (!user) {
    throw {
      code: 'USER_NOT_FOUND',
      message: 'User not found',
      statusCode: 404,
    };
  }
  return user;
}

/**
 * Get current user from request
 * @param {string} userId - User ID from JWT
 * @returns {Object} User object
 */
async function getCurrentUser(userId) {
  return getUserById(userId);
}

/**
 * Update user profile
 * @param {string} userId - User ID
 * @param {Object} updates - { firstName, lastName, phone }
 * @returns {Object} Updated user
 */
async function updateUser(userId, updates) {
  const user = await getUserById(userId);

  // Only allow updating these fields
  const allowedFields = ['firstName', 'lastName', 'phone'];
  const filteredUpdates = {};

  for (const field of allowedFields) {
    if (updates[field] !== undefined) {
      filteredUpdates[field] = updates[field];
    }
  }

  await user.update(filteredUpdates);
  return user;
}

module.exports = {
  registerUser,
  loginUser,
  getUserById,
  getCurrentUser,
  updateUser,
};
