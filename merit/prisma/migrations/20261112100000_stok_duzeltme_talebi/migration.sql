-- Otel deposu sayim duzeltme talebi: minibar sistem sorumlusu yazar, sistem yoneticisi onaylayinca stoga islenir.
CREATE TABLE "stock_correction_requests" (
    "id" TEXT NOT NULL,
    "hotel_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "requested_by_id" TEXT NOT NULL,
    "resolved_by_id" TEXT,
    "system_qty" INTEGER NOT NULL,
    "counted_qty" INTEGER NOT NULL,
    "delta" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "CorrectionRequestStatus" NOT NULL DEFAULT 'BEKLIYOR',
    "resolve_note" TEXT,
    "resolved_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_correction_requests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "stock_correction_requests_hotel_id_status_idx" ON "stock_correction_requests"("hotel_id", "status");

CREATE INDEX "stock_correction_requests_hotel_id_product_id_status_idx" ON "stock_correction_requests"("hotel_id", "product_id", "status");

ALTER TABLE "stock_correction_requests" ADD CONSTRAINT "stock_correction_requests_hotel_id_fkey" FOREIGN KEY ("hotel_id") REFERENCES "hotels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "stock_correction_requests" ADD CONSTRAINT "stock_correction_requests_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "stock_correction_requests" ADD CONSTRAINT "stock_correction_requests_requested_by_id_fkey" FOREIGN KEY ("requested_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "stock_correction_requests" ADD CONSTRAINT "stock_correction_requests_resolved_by_id_fkey" FOREIGN KEY ("resolved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
