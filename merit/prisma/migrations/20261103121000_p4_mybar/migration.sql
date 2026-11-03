BEGIN;

-- Additive fields keep existing requests, transactions and subscriptions intact.
ALTER TABLE "mybar_requests" ADD COLUMN "note_src_lang" VARCHAR(8);
ALTER TABLE "minibar_transactions" ADD COLUMN "mybar_request_id" TEXT;
ALTER TABLE "notifications" ADD COLUMN "pushed_at" TIMESTAMPTZ(3);
ALTER TABLE "push_subscriptions" ADD COLUMN "fail_count" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "text_translations" (
    "id" TEXT NOT NULL,
    "source_hash" VARCHAR(64) NOT NULL,
    "source_text" VARCHAR(600) NOT NULL,
    "target_lang" VARCHAR(8) NOT NULL,
    "translated" VARCHAR(1200) NOT NULL,
    "provider" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "text_translations_pkey" PRIMARY KEY ("id")
);

-- Preflight fails without deleting, merging or inventing historical request data.
-- Resolve legacy violations explicitly before retrying this migration.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM mybar_request_items GROUP BY request_id, product_id HAVING COUNT(*) > 1) THEN
    RAISE EXCEPTION 'P4: duplicate MyBar request products require manual reconciliation';
  END IF;
  IF EXISTS (SELECT 1 FROM mybar_request_items WHERE requested_qty NOT BETWEEN 1 AND 20 OR delivered_qty < 0 OR delivered_qty > requested_qty) THEN
    RAISE EXCEPTION 'P4: invalid MyBar quantities require manual reconciliation';
  END IF;
  IF EXISTS (SELECT 1 FROM mybar_requests WHERE (status = 'TAMAMLANDI' AND completed_at IS NULL) OR (status = 'IPTAL' AND cancelled_at IS NULL)) THEN
    RAISE EXCEPTION 'P4: terminal MyBar requests missing timestamps require manual reconciliation';
  END IF;
END $$;

CREATE UNIQUE INDEX "mybar_request_items_request_id_product_id_key" ON "mybar_request_items"("request_id", "product_id");
CREATE INDEX "mybar_requests_hotel_id_business_date_idx" ON "mybar_requests"("hotel_id", "business_date");
CREATE INDEX "minibar_transactions_mybar_request_id_idx" ON "minibar_transactions"("mybar_request_id");
CREATE INDEX "push_subscriptions_user_id_idx" ON "push_subscriptions"("user_id");
CREATE UNIQUE INDEX "text_translations_source_hash_target_lang_key" ON "text_translations"("source_hash", "target_lang");
ALTER TABLE "minibar_transactions" ADD CONSTRAINT "minibar_transactions_mybar_request_id_fkey" FOREIGN KEY ("mybar_request_id") REFERENCES "mybar_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE mybar_request_items ADD CONSTRAINT mybar_items_qty_chk CHECK (requested_qty BETWEEN 1 AND 20 AND delivered_qty >= 0 AND delivered_qty <= requested_qty);
ALTER TABLE mybar_requests ADD CONSTRAINT mybar_status_ts_chk CHECK ((status <> 'TAMAMLANDI' OR completed_at IS NOT NULL) AND (status <> 'IPTAL' OR cancelled_at IS NOT NULL));
CREATE INDEX mybar_requests_unseen ON mybar_requests (hotel_id, created_at) WHERE seen_at IS NULL AND status = 'BEKLEMEDE';
CREATE INDEX notifications_unpushed ON notifications (user_id, created_at) WHERE pushed_at IS NULL;

COMMIT;
