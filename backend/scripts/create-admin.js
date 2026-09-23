#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Create a system admin account. Registration can't create admins, so this
 * is the only way to make one.
 *
 * Usage (the password comes from the environment so it stays out of shell
 * history and the process list):
 *
 *   read -s ADMIN_PASSWORD && export ADMIN_PASSWORD
 *   npm run create-admin -- --email admin@example.com --first-name Asha --last-name Rao
 *
 * Uses the same database settings as the server (.env / DB_* variables), and
 * expects the tables to exist already (start the server once, or run `npm run upgrade-db`).
 */
const { parseArgs } = require('util');

const usage = () => {
  console.error(
    'Usage: ADMIN_PASSWORD=... npm run create-admin -- --email <email> [--first-name <name>] [--last-name <name>]'
  );
};

const main = async () => {
  let values;
  try {
    ({ values } = parseArgs({
      options: {
        email: { type: 'string' },
        'first-name': { type: 'string' },
        'last-name': { type: 'string' },
      },
    }));
  } catch (error) {
    console.error(error.message);
    usage();
    return 1;
  }

  const password = process.env.ADMIN_PASSWORD;
  if (!values.email || !password) {
    usage();
    return 1;
  }

  const sequelize = require('../src/config/database');
  const { createSystemAdmin } = require('../src/controllers/userController');

  try {
    await sequelize.authenticate();
    const admin = await createSystemAdmin({
      email: values.email,
      password,
      firstName: values['first-name'],
      lastName: values['last-name'],
    });
    console.log(`Created system admin ${admin.email} (${admin.id})`);
    return 0;
  } catch (error) {
    console.error(`Could not create admin: ${error.message}`);
    return 1;
  } finally {
    await sequelize.close();
  }
};

main().then((code) => {
  process.exitCode = code;
});
