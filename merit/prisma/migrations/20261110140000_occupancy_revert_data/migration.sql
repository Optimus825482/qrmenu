-- DEP-1 / DEP-6: an occupancy upload keeps the records it updated or removed, as they were before it, so that
-- deleting the upload restores them instead of deleting records it only touched.

-- AlterTable
ALTER TABLE "occupancy_uploads" ADD COLUMN "revert_data" JSONB;
