-- Canlı Radar, Task 4. Order: Prisma DDL (operation_events, replay indexes), then the @data block
-- (CR-RAD screen and system-scope permissions for databases seeded earlier; fresh databases have
-- no rows here, the seed fills them and is idempotent).

-- CreateTable
CREATE TABLE "operation_events" (
    "id" TEXT NOT NULL,
    "hotel_id" TEXT NOT NULL,
    "outlet_id" TEXT,
    "type" TEXT NOT NULL,
    "ref_id" TEXT,
    "data" JSONB NOT NULL DEFAULT '{}',
    "at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "operation_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "operation_events_hotel_id_at_idx" ON "operation_events"("hotel_id", "at");

-- CreateIndex
CREATE INDEX "order_events_at_idx" ON "order_events"("at");

-- CreateIndex
CREATE INDEX "qr_scan_logs_created_at_idx" ON "qr_scan_logs"("created_at");

-- CreateIndex
CREATE INDEX "room_checks_check_date_idx" ON "room_checks"("check_date");

-- CreateIndex
CREATE INDEX "room_dnd_checks_at_idx" ON "room_dnd_checks"("at");

-- CreateIndex
CREATE INDEX "session_events_created_at_idx" ON "session_events"("created_at");

-- CreateIndex
CREATE INDEX "task_status_logs_created_at_idx" ON "task_status_logs"("created_at");

-- CreateIndex
CREATE INDEX "waiter_calls_outlet_id_created_at_idx" ON "waiter_calls"("outlet_id", "created_at");

-- @data:begin
-- (1) CR-RAD screen right after CR-KOM (sort order shifts the following screens by one).
UPDATE "app_screens" SET "sort_order" = "sort_order" + 1
WHERE NOT EXISTS (SELECT 1 FROM "app_screens" WHERE "code" = 'CR-RAD')
  AND "sort_order" > (SELECT "sort_order" FROM "app_screens" WHERE "code" = 'CR-KOM');

INSERT INTO "app_screens" ("id", "code", "module_key", "name", "path", "group", "sort_order", "is_active", "created_at", "updated_at")
SELECT 'c' || substr(md5(random()::text || clock_timestamp()::text), 1, 24), 'CR-RAD', 'CORE', 'Canlı Radar', '/radar',
       'Ortak / Çekirdek', k."sort_order" + 1, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "app_screens" k
WHERE k."code" = 'CR-KOM' AND NOT EXISTS (SELECT 1 FROM "app_screens" WHERE "code" = 'CR-RAD');

-- (2) System-scope (hotel_id NULL) permissions; NULL is distinct in the unique index, so NOT EXISTS, not ON CONFLICT.
INSERT INTO "role_screen_permissions" ("id", "role_id", "screen_id", "hotel_id", "can_view", "can_create", "can_edit", "can_approve", "can_report", "created_at", "updated_at")
SELECT 'c' || substr(md5(random()::text || clock_timestamp()::text || r."id"), 1, 24), r."id", s."id", NULL,
       true, (r."code" = 'R-SYS'), (r."code" = 'R-SYS'), (r."code" = 'R-SYS'), true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "roles" r, "app_screens" s
WHERE r."code" IN ('R-SYS', 'R-ITT', 'R-OTM', 'R-FBM') AND s."code" = 'CR-RAD'
  AND NOT EXISTS (
    SELECT 1 FROM "role_screen_permissions" p
    WHERE p."role_id" = r."id" AND p."screen_id" = s."id" AND p."hotel_id" IS NULL
  );
-- @data:end
