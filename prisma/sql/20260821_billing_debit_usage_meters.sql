-- Add OpenRouter usage meters to BillingDebit (Portal Usage cards).
-- Run against production if `prisma db push` is not used on deploy:
--   psql "$DATABASE_URL" -f prisma/sql/20260821_billing_debit_usage_meters.sql

ALTER TABLE "BillingDebit" ADD COLUMN IF NOT EXISTS "inputTokens" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "BillingDebit" ADD COLUMN IF NOT EXISTS "outputTokens" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "BillingDebit" ADD COLUMN IF NOT EXISTS "cacheReadTokens" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "BillingDebit" ADD COLUMN IF NOT EXISTS "cacheWriteTokens" INTEGER NOT NULL DEFAULT 0;
