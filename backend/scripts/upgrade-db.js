#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Bring an existing Postgres database up to the current models.
 *
 * Development startup only creates missing tables (it no longer alters
 * existing ones), so schema changes to existing tables are applied here.
 * Every step is idempotent: safe to run on a fresh or already-upgraded database.
 *
 *   npm run upgrade-db
 *
 * Uses the same database settings as the server (.env / DB_* variables).
 */
const sequelize = require('../src/config/database');

// Add new steps at the end; never edit or reorder existing ones
const STEPS = [
  {
    name: 'Delivery partners: role',
    // ALTER TYPE ... ADD VALUE can't run in a transaction, so each step runs on its own
    sql: `ALTER TYPE "enum_users_role" ADD VALUE IF NOT EXISTS 'delivery_partner'`,
  },
  {
    name: 'Delivery partners: rider status type',
    sql: `DO $$ BEGIN
            CREATE TYPE "enum_users_rider_status" AS ENUM ('pending', 'approved', 'suspended');
          EXCEPTION WHEN duplicate_object THEN NULL;
          END $$`,
  },
  {
    name: 'Delivery partners: users.rider_status',
    sql: `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "rider_status" "enum_users_rider_status"`,
  },
  {
    name: 'Delivery partners: Orders.rider_id',
    sql: `ALTER TABLE "Orders" ADD COLUMN IF NOT EXISTS "rider_id" UUID
            REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE`,
  },
  {
    name: 'Delivery partners: Orders.claimed_at',
    sql: `ALTER TABLE "Orders" ADD COLUMN IF NOT EXISTS "claimed_at" TIMESTAMP WITH TIME ZONE`,
  },
  {
    name: 'Delivery partners: index on rider and status',
    sql: `CREATE INDEX IF NOT EXISTS "orders_rider_id_status" ON "Orders" ("rider_id", "status")`,
  },
];

const main = async () => {
  if (sequelize.getDialect() !== 'postgres') {
    console.log(`Nothing to do for ${sequelize.getDialect()}: SQLite databases are created from the models.`);
    return 0;
  }
  try {
    await sequelize.authenticate();
    for (const step of STEPS) {
      await sequelize.query(step.sql);
      console.log(`✓ ${step.name}`);
    }
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
