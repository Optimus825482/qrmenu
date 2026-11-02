-- Schema drift: schema.prisma'da olup hiçbir migration'ı bulunmayan nesneler.

-- CreateEnum
CREATE TYPE "CorrectionRequestStatus" AS ENUM ('BEKLIYOR', 'ONAYLANDI', 'REDDEDILDI');

-- CreateEnum
CREATE TYPE "CorrectionActionType" AS ENUM ('SILME', 'DUZELTME');

-- AlterTable
ALTER TABLE "menu_nodes" ADD COLUMN "image_urls" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "room_checks" ADD COLUMN "transaction_id" TEXT;

-- CreateTable
CREATE TABLE "minibar_correction_requests" (
    "id" TEXT NOT NULL,
    "hotel_id" TEXT NOT NULL,
    "transaction_id" TEXT,
    "requested_by_id" TEXT NOT NULL,
    "approved_by_id" TEXT,
    "action_type" "CorrectionActionType" NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "CorrectionRequestStatus" NOT NULL DEFAULT 'BEKLIYOR',
    "proposed_data" JSONB,
    "reject_reason" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMPTZ(3),

    CONSTRAINT "minibar_correction_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "minibar_correction_requests_hotel_id_status_idx" ON "minibar_correction_requests"("hotel_id", "status");

-- CreateIndex (menudes migration'ı düşürmüştü; şema ile hizalı)
CREATE INDEX "outlet_tables_area_id_idx" ON "outlet_tables"("area_id");

-- AddForeignKey
ALTER TABLE "room_checks" ADD CONSTRAINT "room_checks_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "minibar_transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "minibar_correction_requests" ADD CONSTRAINT "minibar_correction_requests_hotel_id_fkey" FOREIGN KEY ("hotel_id") REFERENCES "hotels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "minibar_correction_requests" ADD CONSTRAINT "minibar_correction_requests_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "minibar_transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "minibar_correction_requests" ADD CONSTRAINT "minibar_correction_requests_requested_by_id_fkey" FOREIGN KEY ("requested_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "minibar_correction_requests" ADD CONSTRAINT "minibar_correction_requests_approved_by_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable (outlet_call_options migration kept a DEFAULT that the schema (@updatedAt) does not have)
ALTER TABLE "outlet_call_options" ALTER COLUMN "updated_at" DROP DEFAULT;
