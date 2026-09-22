#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Set a new password for an existing account. There's no self-service
 * password reset in the API yet, so this is the way to recover an account.
 *
 * Usage (the password comes from the environment so it stays out of shell
 * history and the process list):
 *
 *   read -s NEW_PASSWORD && export NEW_PASSWORD
 *   npm run reset-password -- --email someone@example.com
 *
 * Uses the same database settings as the server (.env / DB_* variables).
 */
const { parseArgs } = require('util');

const usage = () => {
  console.error('Usage: NEW_PASSWORD=... npm run reset-password -- --email <email>');
};

const main = async () => {
  let values;
  try {
    ({ values } = parseArgs({ options: { email: { type: 'string' } } }));
  } catch (error) {
    console.error(error.message);
    usage();
    return 1;
  }

  const password = process.env.NEW_PASSWORD;
  if (!values.email || !password) {
    usage();
    return 1;
  }
  if (password.length < 8) {
    console.error('Password must be at least 8 characters');
    return 1;
  }

  const validator = require('validator');
  const sequelize = require('../src/config/database');
  const { User } = require('../src/models');

  try {
    await sequelize.authenticate();
    // Same normalization as the login route, so the lookup matches
    const email = validator.normalizeEmail(values.email.trim()) || values.email.trim();
    const user = await User.findOne({ where: { email } });
    if (!user) {
      console.error(`No account with email ${values.email}`);
      return 1;
    }
    if (user.role === 'system_admin' && password.length < 12) {
      console.error('System admin passwords must be at least 12 characters');
      return 1;
    }

    user.passwordHash = password; // hashed by the beforeUpdate hook
    await user.save();
    console.log(`Password updated for ${user.email} (${user.role})`);
    return 0;
  } catch (error) {
    console.error(`Could not reset password: ${error.message}`);
    return 1;
  } finally {
    await sequelize.close();
  }
};

main().then((code) => {
  process.exitCode = code;
});
