-- Expand BillingChargeType to cover the 14 business billing models.
-- The original 4 values (HOURLY, MONTHLY, CONSULTANT_HOURLY, FIXED) are kept
-- unchanged. Postgres only allows adding values to an existing enum
-- (ALTER TYPE ... ADD VALUE), never removing/renaming, so this migration is
-- purely additive and safe for existing rows.
--
-- IF NOT EXISTS makes each statement idempotent. ALTER TYPE ... ADD VALUE
-- cannot run inside a transaction block, and a newly added enum value cannot be
-- used in the same transaction. Prisma runs each statement separately, so this
-- is fine for migrate deploy. If applying these statements manually in a single
-- session, run them outside an explicit transaction.

ALTER TYPE "BillingChargeType" ADD VALUE IF NOT EXISTS 'HOURLY_PLUS_FIXED';
ALTER TYPE "BillingChargeType" ADD VALUE IF NOT EXISTS 'HOUR_PACKAGE';
ALTER TYPE "BillingChargeType" ADD VALUE IF NOT EXISTS 'PER_ALLOCATED_CONSULTANT';
ALTER TYPE "BillingChargeType" ADD VALUE IF NOT EXISTS 'PER_PROJECT';
ALTER TYPE "BillingChargeType" ADD VALUE IF NOT EXISTS 'MILESTONE';
ALTER TYPE "BillingChargeType" ADD VALUE IF NOT EXISTS 'PER_SPRINT';
ALTER TYPE "BillingChargeType" ADD VALUE IF NOT EXISTS 'TIME_AND_MATERIAL';
ALTER TYPE "BillingChargeType" ADD VALUE IF NOT EXISTS 'ON_DEMAND';
ALTER TYPE "BillingChargeType" ADD VALUE IF NOT EXISTS 'SUBSCRIPTION';
ALTER TYPE "BillingChargeType" ADD VALUE IF NOT EXISTS 'PAY_AS_YOU_GO';
ALTER TYPE "BillingChargeType" ADD VALUE IF NOT EXISTS 'SUCCESS_FEE';
ALTER TYPE "BillingChargeType" ADD VALUE IF NOT EXISTS 'MIXED';
