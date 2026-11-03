-- Minibar tamamlama, Task 1 (temel). Order matters:
--   1. @data block  : normalise old rows BEFORE the new unique index / CHECK constraints are created
--   2. Prisma DDL   : columns, tables, indexes (UploadStatus.BEKLIYOR and occupancy_uploads.stored_path
--                     were added by 20261103091000 and are not repeated here)
--   3. CHECK constraints
--   4. @limits block: role screen limits for databases seeded earlier (mirrors SCREEN_LIMITS in prisma/seed/roles.ts)

-- @data:begin
-- (1) Upload kinds: ARRIVALS -> ARRIVAL, DEPARTURES -> DEPARTURE, everything else (GENERAL included) -> IN_HOUSE.
UPDATE "occupancy_uploads" SET "kind" = CASE
  WHEN "kind" IN ('ARRIVAL', 'ARRIVALS') THEN 'ARRIVAL'
  WHEN "kind" IN ('DEPARTURE', 'DEPARTURES') THEN 'DEPARTURE'
  ELSE 'IN_HOUSE' END
WHERE "kind" NOT IN ('IN_HOUSE', 'ARRIVAL', 'DEPARTURE');

UPDATE "upload_tasks" SET "kind" = CASE
  WHEN "kind" IN ('ARRIVAL', 'ARRIVALS') THEN 'ARRIVAL'
  WHEN "kind" IN ('DEPARTURE', 'DEPARTURES') THEN 'DEPARTURE'
  ELSE 'IN_HOUSE' END
WHERE "kind" NOT IN ('IN_HOUSE', 'ARRIVAL', 'DEPARTURE');

-- (2) Duplicate task items: for the same (task_id, room_id) the smallest id stays (before the unique index).
DELETE FROM "daily_task_items" a USING "daily_task_items" b
WHERE a."task_id" = b."task_id" AND a."room_id" = b."room_id" AND a."id" > b."id";

-- (3) Signed movements: qty is the effect on the pool's remaining_qty.
UPDATE "hotel_stock_movements" SET "qty" = -abs("qty")
WHERE "type" IN ('KULLANIM', 'MYBAR') AND "qty" > 0;

UPDATE "hotel_stock_movements" SET "qty" = abs("qty")
WHERE "type" IN ('GIRIS', 'GOC') AND "qty" < 0;

UPDATE "hotel_stock_movements" SET "qty" = abs("qty")
WHERE "type" = 'IADE' AND "ref_type" = 'MinibarTransaction' AND "qty" < 0;

UPDATE "hotel_stock_movements" SET "qty" = -abs("qty")
WHERE "type" = 'IADE' AND ("ref_type" IS NULL OR "ref_type" <> 'MinibarTransaction') AND "qty" > 0;

-- (4) Balance repair so the CHECK constraints below hold: total - used = remaining.
UPDATE "hotel_stocks" SET "used_qty" = greatest("used_qty", 0), "critical_level" = greatest("critical_level", 0);

UPDATE "hotel_stocks" SET "total_qty" = "used_qty" + "remaining_qty"
WHERE "total_qty" <> "used_qty" + "remaining_qty";

UPDATE "products" SET "critical_level" = greatest("critical_level", 0) WHERE "critical_level" < 0;

UPDATE "products" SET
  "purchase_price" = CASE WHEN "purchase_price" < 0 THEN NULL ELSE "purchase_price" END,
  "sale_price" = CASE WHEN "sale_price" < 0 THEN NULL ELSE "sale_price" END
WHERE "purchase_price" < 0 OR "sale_price" < 0;
-- @data:end

-- AlterTable
ALTER TABLE "minibar_transaction_items" ADD COLUMN     "is_complimentary" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "legacy_extra" INTEGER;

-- AlterTable
ALTER TABLE "minibar_transactions" ADD COLUMN     "client_request_id" TEXT;

-- AlterTable
ALTER TABLE "room_dnds" ADD COLUMN     "reminder_sent_at" TIMESTAMPTZ(3);

-- CreateTable
CREATE TABLE "legacy_id_map" (
    "entity" VARCHAR(40) NOT NULL,
    "legacy_id" VARCHAR(120) NOT NULL,
    "new_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "legacy_id_map_pkey" PRIMARY KEY ("entity","legacy_id")
);

-- CreateTable
CREATE TABLE "legacy_personel_zimmet" (
    "id" TEXT NOT NULL,
    "legacy_table" TEXT NOT NULL,
    "legacy_id" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "legacy_personel_zimmet_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "legacy_id_map_entity_new_id_idx" ON "legacy_id_map"("entity", "new_id");

-- CreateIndex
CREATE UNIQUE INDEX "legacy_personel_zimmet_legacy_table_legacy_id_key" ON "legacy_personel_zimmet"("legacy_table", "legacy_id");

-- CreateIndex
CREATE INDEX "daily_task_items_room_id_idx" ON "daily_task_items"("room_id");

-- CreateIndex
CREATE UNIQUE INDEX "daily_task_items_task_id_room_id_key" ON "daily_task_items"("task_id", "room_id");

-- CreateIndex
CREATE INDEX "guest_records_hotel_id_kind_arrival_date_departure_date_idx" ON "guest_records"("hotel_id", "kind", "arrival_date", "departure_date");

-- CreateIndex
CREATE INDEX "guest_records_room_id_kind_idx" ON "guest_records"("room_id", "kind");

-- CreateIndex
CREATE INDEX "hotel_stock_movements_hotel_id_created_at_idx" ON "hotel_stock_movements"("hotel_id", "created_at");

-- CreateIndex
CREATE INDEX "minibar_transaction_items_transaction_id_idx" ON "minibar_transaction_items"("transaction_id");

-- CreateIndex
CREATE UNIQUE INDEX "minibar_transactions_client_request_id_key" ON "minibar_transactions"("client_request_id");

-- CreateIndex
CREATE INDEX "minibar_transactions_user_id_occurred_at_idx" ON "minibar_transactions"("user_id", "occurred_at");

-- CreateIndex
CREATE INDEX "notifications_type_ref_id_created_at_idx" ON "notifications"("type", "ref_id", "created_at");

-- CreateIndex
CREATE INDEX "room_dnds_status_date_idx" ON "room_dnds"("status", "date");

-- CreateIndex
CREATE INDEX "stock_requests_hotel_id_status_idx" ON "stock_requests"("hotel_id", "status");


-- CHECK constraints (the existing remaining_qty >= 0 constraint stays). NULL prices pass.
ALTER TABLE "hotel_stocks" ADD CONSTRAINT "hotel_stocks_used_qty_check" CHECK ("used_qty" >= 0);
ALTER TABLE "hotel_stocks" ADD CONSTRAINT "hotel_stocks_total_qty_check" CHECK ("total_qty" >= 0);
ALTER TABLE "hotel_stocks" ADD CONSTRAINT "hotel_stocks_critical_level_check" CHECK ("critical_level" >= 0);
ALTER TABLE "hotel_stocks" ADD CONSTRAINT "hotel_stocks_balance_check" CHECK ("total_qty" - "used_qty" = "remaining_qty");
ALTER TABLE "products" ADD CONSTRAINT "products_critical_level_check" CHECK ("critical_level" >= 0);
ALTER TABLE "products" ADD CONSTRAINT "products_prices_check" CHECK ("purchase_price" >= 0 AND "sale_price" >= 0);

-- @limits:begin
-- Role screen limits (P2/P3). Fresh databases have no rows here (the seed applies SCREEN_LIMITS after the migrations).

UPDATE "role_screen_permissions" p
SET "can_approve" = false, "can_report" = false
FROM "roles" r, "app_screens" s
WHERE p."role_id" = r."id" AND p."screen_id" = s."id" AND p."hotel_id" IS NULL
  AND r."code" IN ('R-OTM') AND s."code" = 'MB-TAN';

UPDATE "role_screen_permissions" p
SET "can_create" = false, "can_edit" = false, "can_approve" = false, "can_report" = false
FROM "roles" r, "app_screens" s
WHERE p."role_id" = r."id" AND p."screen_id" = s."id" AND p."hotel_id" IS NULL
  AND r."code" IN ('R-OTM') AND s."code" = 'MB-ZIM';

UPDATE "role_screen_permissions" p
SET "can_create" = false, "can_edit" = false, "can_approve" = false, "can_report" = false
FROM "roles" r, "app_screens" s
WHERE p."role_id" = r."id" AND p."screen_id" = s."id" AND p."hotel_id" IS NULL
  AND r."code" IN ('R-DEP') AND s."code" = 'MB-TAN';

UPDATE "role_screen_permissions" p
SET "can_approve" = false, "can_report" = false
FROM "roles" r, "app_screens" s
WHERE p."role_id" = r."id" AND p."screen_id" = s."id" AND p."hotel_id" IS NULL
  AND r."code" IN ('R-DEP') AND s."code" = 'MB-ZIM';

UPDATE "role_screen_permissions" p
SET "can_create" = false, "can_edit" = false, "can_approve" = false, "can_report" = false
FROM "roles" r, "app_screens" s
WHERE p."role_id" = r."id" AND p."screen_id" = s."id" AND p."hotel_id" IS NULL
  AND r."code" IN ('R-HKS') AND s."code" = 'MB-TAN';

UPDATE "role_screen_permissions" p
SET "can_create" = false, "can_edit" = false, "can_approve" = false
FROM "roles" r, "app_screens" s
WHERE p."role_id" = r."id" AND p."screen_id" = s."id" AND p."hotel_id" IS NULL
  AND r."code" IN ('R-HKS') AND s."code" = 'MB-ZIM';

DELETE FROM "role_screen_permissions" p USING "roles" r, "app_screens" s
WHERE p."role_id" = r."id" AND p."screen_id" = s."id" AND p."hotel_id" IS NULL
  AND r."code" IN ('R-KAT') AND s."code" = 'MB-TAN';

UPDATE "role_screen_permissions" p
SET "can_create" = false, "can_approve" = false, "can_report" = false
FROM "roles" r, "app_screens" s
WHERE p."role_id" = r."id" AND p."screen_id" = s."id" AND p."hotel_id" IS NULL
  AND r."code" IN ('R-KAT') AND s."code" = 'MB-ZIM';

UPDATE "role_screen_permissions" p
SET "can_create" = false, "can_edit" = false, "can_approve" = false, "can_report" = false
FROM "roles" r, "app_screens" s
WHERE p."role_id" = r."id" AND p."screen_id" = s."id" AND p."hotel_id" IS NULL
  AND r."code" IN ('R-KAT') AND s."code" = 'MB-KAT';

UPDATE "role_screen_permissions" p
SET "can_create" = false, "can_edit" = false, "can_approve" = false, "can_report" = false
FROM "roles" r, "app_screens" s
WHERE p."role_id" = r."id" AND p."screen_id" = s."id" AND p."hotel_id" IS NULL
  AND r."code" IN ('R-KAT') AND s."code" = 'MB-KF';

UPDATE "role_screen_permissions" p
SET "can_approve" = false, "can_report" = false
FROM "roles" r, "app_screens" s
WHERE p."role_id" = r."id" AND p."screen_id" = s."id" AND p."hotel_id" IS NULL
  AND r."code" IN ('R-KAT') AND s."code" = 'MB-TUK';

UPDATE "role_screen_permissions" p
SET "can_create" = false, "can_approve" = false, "can_report" = false
FROM "roles" r, "app_screens" s
WHERE p."role_id" = r."id" AND p."screen_id" = s."id" AND p."hotel_id" IS NULL
  AND r."code" IN ('R-KAT') AND s."code" = 'MB-ZIM';

UPDATE "role_screen_permissions" p
SET "can_edit" = false, "can_approve" = false, "can_report" = false
FROM "roles" r, "app_screens" s
WHERE p."role_id" = r."id" AND p."screen_id" = s."id" AND p."hotel_id" IS NULL
  AND r."code" IN ('R-KAT') AND s."code" = 'MB-TAL';

UPDATE "role_screen_permissions" p
SET "can_create" = false, "can_edit" = false, "can_approve" = false, "can_report" = false
FROM "roles" r, "app_screens" s
WHERE p."role_id" = r."id" AND p."screen_id" = s."id" AND p."hotel_id" IS NULL
  AND r."code" IN ('R-KAT') AND s."code" = 'MB-DND';

DELETE FROM "role_screen_permissions" p USING "roles" r, "app_screens" s
WHERE p."role_id" = r."id" AND p."screen_id" = s."id" AND p."hotel_id" IS NULL
  AND r."code" IN ('R-KAT') AND s."code" = 'MB-DOL';

UPDATE "role_screen_permissions" p
SET "can_create" = false, "can_edit" = false, "can_approve" = false, "can_report" = false
FROM "roles" r, "app_screens" s
WHERE p."role_id" = r."id" AND p."screen_id" = s."id" AND p."hotel_id" IS NULL
  AND r."code" IN ('R-DEP') AND s."code" = 'MB-KAT';

DELETE FROM "role_screen_permissions" p USING "roles" r, "app_screens" s
WHERE p."role_id" = r."id" AND p."screen_id" = s."id" AND p."hotel_id" IS NULL
  AND r."code" IN ('R-DEP') AND s."code" = 'MB-KF';

UPDATE "role_screen_permissions" p
SET "can_create" = false, "can_edit" = false, "can_approve" = false, "can_report" = false
FROM "roles" r, "app_screens" s
WHERE p."role_id" = r."id" AND p."screen_id" = s."id" AND p."hotel_id" IS NULL
  AND r."code" IN ('R-DEP') AND s."code" = 'MB-TUK';

UPDATE "role_screen_permissions" p
SET "can_approve" = false, "can_report" = false
FROM "roles" r, "app_screens" s
WHERE p."role_id" = r."id" AND p."screen_id" = s."id" AND p."hotel_id" IS NULL
  AND r."code" IN ('R-DEP') AND s."code" = 'MB-ZIM';

UPDATE "role_screen_permissions" p
SET "can_create" = false, "can_report" = false
FROM "roles" r, "app_screens" s
WHERE p."role_id" = r."id" AND p."screen_id" = s."id" AND p."hotel_id" IS NULL
  AND r."code" IN ('R-DEP') AND s."code" = 'MB-TAL';

UPDATE "role_screen_permissions" p
SET "can_approve" = false, "can_report" = false
FROM "roles" r, "app_screens" s
WHERE p."role_id" = r."id" AND p."screen_id" = s."id" AND p."hotel_id" IS NULL
  AND r."code" IN ('R-DEP') AND s."code" = 'MB-DOL';

UPDATE "role_screen_permissions" p
SET "can_create" = false, "can_edit" = false, "can_approve" = false, "can_report" = false
FROM "roles" r, "app_screens" s
WHERE p."role_id" = r."id" AND p."screen_id" = s."id" AND p."hotel_id" IS NULL
  AND r."code" IN ('R-DEP') AND s."code" = 'MB-DND';

DELETE FROM "role_screen_permissions" p USING "roles" r, "app_screens" s
WHERE p."role_id" = r."id" AND p."screen_id" = s."id" AND p."hotel_id" IS NULL
  AND r."code" IN ('R-OTM') AND s."code" = 'MB-KF';

UPDATE "role_screen_permissions" p
SET "can_create" = false, "can_edit" = false, "can_approve" = false, "can_report" = false
FROM "roles" r, "app_screens" s
WHERE p."role_id" = r."id" AND p."screen_id" = s."id" AND p."hotel_id" IS NULL
  AND r."code" IN ('R-OTM') AND s."code" = 'MB-TUK';
-- @limits:end
