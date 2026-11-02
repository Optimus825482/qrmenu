-- Minibar Task 9 (doluluk Excel): UploadTask.BEKLIYOR, OccupancyUpload.storedPath, kind normalisation.
-- Task 1 (temel migration) must NOT repeat these three statements.
ALTER TYPE "UploadStatus" ADD VALUE IF NOT EXISTS 'BEKLIYOR';

ALTER TABLE "occupancy_uploads" ADD COLUMN IF NOT EXISTS "stored_path" TEXT;

UPDATE "occupancy_uploads" SET "kind" = 'IN_HOUSE' WHERE "kind" IN ('GENERAL', 'INHOUSE');
UPDATE "occupancy_uploads" SET "kind" = 'ARRIVAL' WHERE "kind" = 'ARRIVALS';
UPDATE "occupancy_uploads" SET "kind" = 'DEPARTURE' WHERE "kind" = 'DEPARTURES';
