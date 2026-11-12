-- Manuel kayit talebi: oda QR kodu okutulamadiginda kat sorumlusu odadaki tuketimi aciklamasiyla birlikte
-- Minibar Yonetimi'ne gonderir; tuketim odaya yalniz onayla islenir (onayda olusan islem transaction_id'de tutulur).
CREATE TABLE "minibar_manual_entry_requests" (
    "id" TEXT NOT NULL,
    "hotel_id" TEXT NOT NULL,
    "room_id" TEXT NOT NULL,
    "requested_by_id" TEXT NOT NULL,
    "decided_by_id" TEXT,
    "reason" TEXT NOT NULL,
    "items" JSONB NOT NULL,
    "status" "CorrectionRequestStatus" NOT NULL DEFAULT 'BEKLIYOR',
    "reject_reason" TEXT,
    "transaction_id" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMPTZ(3),
    CONSTRAINT "minibar_manual_entry_requests_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "minibar_manual_entry_requests_transaction_id_key" ON "minibar_manual_entry_requests"("transaction_id");
CREATE INDEX "minibar_manual_entry_requests_hotel_id_status_idx" ON "minibar_manual_entry_requests"("hotel_id", "status");
CREATE INDEX "minibar_manual_entry_requests_hotel_id_created_at_idx" ON "minibar_manual_entry_requests"("hotel_id", "created_at");
CREATE INDEX "minibar_manual_entry_requests_requested_by_id_created_at_idx" ON "minibar_manual_entry_requests"("requested_by_id", "created_at");
ALTER TABLE "minibar_manual_entry_requests" ADD CONSTRAINT "minibar_manual_entry_requests_hotel_id_fkey" FOREIGN KEY ("hotel_id") REFERENCES "hotels"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "minibar_manual_entry_requests" ADD CONSTRAINT "minibar_manual_entry_requests_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "minibar_manual_entry_requests" ADD CONSTRAINT "minibar_manual_entry_requests_requested_by_id_fkey" FOREIGN KEY ("requested_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "minibar_manual_entry_requests" ADD CONSTRAINT "minibar_manual_entry_requests_decided_by_id_fkey" FOREIGN KEY ("decided_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "minibar_manual_entry_requests" ADD CONSTRAINT "minibar_manual_entry_requests_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "minibar_transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
