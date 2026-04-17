const bcrypt = require('bcryptjs');
const config = require('../config');

/**
 * Hash password with bcrypt
 */
const hashPassword = async (password) => {
  const salt = await bcrypt.genSalt(config.security.bcryptRounds);
  return bcrypt.hash(password, salt);
};

/**
 * Compare password with hash
 */
const comparePassword = async (password, hash) => {
  return bcrypt.compare(password, hash);
};

module.exports = {
  hashPassword,
  comparePassword
};
