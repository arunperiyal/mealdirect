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
  {
    name: 'Order automation: Restaurants settings columns',
    sql: `ALTER TABLE "Restaurants"
            ADD COLUMN IF NOT EXISTS "auto_accept_orders" BOOLEAN NOT NULL DEFAULT false,
            ADD COLUMN IF NOT EXISTS "auto_ready_minutes" INTEGER`,
  },
  {
    name: 'Payout details: users payout columns',
    sql: `ALTER TABLE "users"
            ADD COLUMN IF NOT EXISTS "bank_account_name" VARCHAR(255),
            ADD COLUMN IF NOT EXISTS "bank_account_number" VARCHAR(255),
            ADD COLUMN IF NOT EXISTS "bank_i_f_s_c" VARCHAR(255),
            ADD COLUMN IF NOT EXISTS "upi_id" VARCHAR(255)`,
  },
  {
    name: 'Account deletion: users.deleted_by_id',
    sql: `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "deleted_by_id" UUID`,
  },
  {
    // The avatars table itself is new, so sync creates it
    name: 'Profile pictures: users.avatar_updated_at',
    sql: `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "avatar_updated_at" TIMESTAMP WITH TIME ZONE`,
  },
  {
    // The AutoAcceptRules table itself is new, so sync creates it
    name: 'Rider auto-accept: Orders.released_rider_ids',
    sql: `ALTER TABLE "Orders" ADD COLUMN IF NOT EXISTS "released_rider_ids" JSON NOT NULL DEFAULT '[]'`,
  },
  {
    name: 'Rider auto-accept: users.auto_accept_limit',
    sql: `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "auto_accept_limit" INTEGER`,
  },
  {
    // Existing menus keep null: their opening time isn't enforced, as before
    name: 'Overnight ordering: Menus ordering days',
    sql: `ALTER TABLE "Menus"
            ADD COLUMN IF NOT EXISTS "ordering_opens_day" INTEGER,
            ADD COLUMN IF NOT EXISTS "ordering_closes_day" INTEGER`,
  },
  {
    name: 'Several menus a day: Menus.name',
    sql: `ALTER TABLE "Menus" ADD COLUMN IF NOT EXISTS "name" VARCHAR(60) NOT NULL DEFAULT 'Menu'`,
  },
  {
    name: 'Password reset: users reset and password-changed columns',
    sql: `ALTER TABLE "users"
            ADD COLUMN IF NOT EXISTS "password_changed_at" TIMESTAMP WITH TIME ZONE,
            ADD COLUMN IF NOT EXISTS "password_reset_hash" VARCHAR(255),
            ADD COLUMN IF NOT EXISTS "password_reset_expires_at" TIMESTAMP WITH TIME ZONE,
            ADD COLUMN IF NOT EXISTS "password_reset_sent_at" TIMESTAMP WITH TIME ZONE,
            ADD COLUMN IF NOT EXISTS "password_reset_attempts" INTEGER NOT NULL DEFAULT 0`,
  },
  {
    name: 'Email verification: users code columns',
    sql: `ALTER TABLE "users"
            ADD COLUMN IF NOT EXISTS "verification_sent_at" TIMESTAMP WITH TIME ZONE,
            ADD COLUMN IF NOT EXISTS "verification_attempts" INTEGER NOT NULL DEFAULT 0`,
  },
  {
    // Accounts from before email verification aren't asked for a code. Bounded by date,
    // so running this again never verifies a newer account.
    name: 'Email verification: earlier accounts count as verified',
    sql: `UPDATE "users" SET "is_verified" = true WHERE "is_verified" = false AND "created_at" < '2026-10-09'`,
  },
  {
    name: 'Emails as typed: users.email_key',
    sql: `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "email_key" VARCHAR(255)`,
  },
  {
    // Same rule as lib/email.js emailKey: Gmail ignores dots and a +tag in the name
    name: 'Emails as typed: fill users.email_key',
    sql: `UPDATE "users" SET "email_key" = CASE
            WHEN split_part(lower("email"), '@', 2) IN ('gmail.com', 'googlemail.com')
              THEN replace(split_part(split_part(lower("email"), '@', 1), '+', 1), '.', '') || '@gmail.com'
            ELSE lower("email") END
          WHERE "email_key" IS NULL`,
  },
  {
    name: 'Emails as typed: users.email_key required',
    sql: `ALTER TABLE "users" ALTER COLUMN "email_key" SET NOT NULL`,
  },
  {
    name: 'Emails as typed: one account per email_key',
    sql: `CREATE UNIQUE INDEX IF NOT EXISTS "users_email_key_unique" ON "users" ("email_key")`,
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
