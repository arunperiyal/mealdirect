/**
 * Create or upgrade the database schema.
 *
 * - Fresh database: create every table from the models.
 * - Existing Postgres database: apply the upgrade steps below, then create any
 *   tables or indexes that are new. Steps must run first: model indexes can
 *   refer to columns a step adds.
 *
 * Every step is idempotent. Add new steps at the end; never edit or reorder
 * existing ones.
 */
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
  {
    name: 'Pay on delivery: collection status type',
    sql: `DO $$ BEGIN
            CREATE TYPE "enum_Orders_collection_status" AS ENUM ('awaiting', 'collected', 'not_paid', 'written_off');
          EXCEPTION WHEN duplicate_object THEN NULL;
          END $$`,
  },
  {
    name: 'Pay on delivery: collection method type',
    sql: `DO $$ BEGIN
            CREATE TYPE "enum_Orders_collection_method" AS ENUM ('cash', 'upi');
          EXCEPTION WHEN duplicate_object THEN NULL;
          END $$`,
  },
  {
    name: 'Pay on delivery: Orders collection columns',
    sql: `ALTER TABLE "Orders"
            ADD COLUMN IF NOT EXISTS "collection_status" "enum_Orders_collection_status",
            ADD COLUMN IF NOT EXISTS "collection_method" "enum_Orders_collection_method",
            ADD COLUMN IF NOT EXISTS "collected_by_id" UUID REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
            ADD COLUMN IF NOT EXISTS "collected_at" TIMESTAMP WITH TIME ZONE,
            ADD COLUMN IF NOT EXISTS "collection_note" TEXT`,
  },
  {
    // Cash orders from before this change: paid ones count as collected (method
    // unknown, so they never enter a rider's cash balance), the rest await it
    name: 'Pay on delivery: backfill existing cash orders',
    sql: `UPDATE "Orders"
             SET "collection_status" = CASE WHEN "payment_status" = 'completed' THEN 'collected' ELSE 'awaiting' END::"enum_Orders_collection_status"
           WHERE "payment_method" = 'cod' AND "collection_status" IS NULL`,
  },
];

const upgradeDatabase = async (sequelize, log = () => {}) => {
  // Register every model before syncing
  require('../models');

  if (sequelize.getDialect() !== 'postgres') {
    await sequelize.sync();
    return { created: true, applied: [] };
  }

  const tables = await sequelize.getQueryInterface().showAllTables();
  if (!tables.includes('users')) {
    await sequelize.sync();
    log('Created the schema from the models');
    return { created: true, applied: [] };
  }

  for (const step of STEPS) {
    await sequelize.query(step.sql);
    log(`✓ ${step.name}`);
  }
  // New tables and indexes (existing tables are never altered here)
  await sequelize.sync();
  return { created: false, applied: STEPS.map((s) => s.name) };
};

module.exports = { upgradeDatabase, STEPS };
