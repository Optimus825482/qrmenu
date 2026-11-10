-- AlterTable
ALTER TABLE "outlets" ADD COLUMN "currency" VARCHAR(3) NOT NULL DEFAULT 'EUR';

-- Backfill: the currency now lives on the outlet. Existing outlets take the former
-- `price.currency` setting (hotel row first, then the system row), EUR when neither is valid.
UPDATE "outlets" AS o
SET "currency" = COALESCE(
  (SELECT s."value" #>> '{}' FROM "settings" s
    WHERE s."hotel_id" = o."hotel_id" AND s."key" = 'price.currency'
      AND (s."value" #>> '{}') ~ '^[A-Z]{3}$'
    LIMIT 1),
  (SELECT s."value" #>> '{}' FROM "settings" s
    WHERE s."hotel_id" IS NULL AND s."key" = 'price.currency'
      AND (s."value" #>> '{}') ~ '^[A-Z]{3}$'
    LIMIT 1),
  'EUR'
);
