#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Create or upgrade the database schema (see src/db/upgrade.js). Run it on
 * every deploy, before starting the new version. Safe to run repeatedly.
 *
 *   npm run upgrade-db
 *
 * Uses the same database settings as the server (.env / DB_* variables).
 */
const sequelize = require('../src/config/database');
const { upgradeDatabase } = require('../src/db/upgrade');

const main = async () => {
  try {
    sequelize.options.logging = false;
    await sequelize.authenticate();
    await upgradeDatabase(sequelize, console.log);
    console.log('Database is up to date.');
    return 0;
  } catch (error) {
    console.error(`Upgrade failed: ${error.message}`);
    return 1;
  } finally {
    await sequelize.close();
  }
};

main().then((code) => {
  process.exitCode = code;
});
