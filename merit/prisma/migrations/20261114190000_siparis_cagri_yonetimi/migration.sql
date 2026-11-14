-- Sipariş ve Çağrı Yönetimi (14 Kas 2026): one window where the system administrator lists the table orders and the
-- guest calls of every outlet of a hotel, corrects a status and cancels with a reason.
-- 1) A waiter call can now be cancelled: status IPTAL with who, when and why (until now only ACIK -> YANITLANDI ->
--    KAPANDI existed, with no reason and no audit trail).
-- 2) The window gets its own screen, QS-YON, so the Yetki Matrisi decides who has it: V opens the window, D corrects
--    a status (next stage, call answered / closed), A cancels. By default only R-SYS (modules ALL); anybody else
--    gets it from the Yetki Matrisi. prisma/seed/roles.ts (SCREEN_LIMITS "YON") writes the same on a fresh database.
--    Global (hotel_id IS NULL) rows only. Repeatable; a row an administrator has changed since is not touched.

ALTER TYPE "CallStatus" ADD VALUE IF NOT EXISTS 'IPTAL';

ALTER TABLE "waiter_calls" ADD COLUMN "cancelled_by_id" TEXT;
ALTER TABLE "waiter_calls" ADD COLUMN "cancelled_at" TIMESTAMPTZ(3);
ALTER TABLE "waiter_calls" ADD COLUMN "cancel_note" VARCHAR(200);
ALTER TABLE "waiter_calls" ADD CONSTRAINT "waiter_calls_cancelled_by_id_fkey"
  FOREIGN KEY ("cancelled_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- @data:begin
INSERT INTO "app_screens" ("id", "code", "module_key", "name", "path", "group", "sort_order", "is_active", "created_at", "updated_at")
SELECT 'c' || substr(md5(random()::text || clock_timestamp()::text), 1, 24), 'QS-YON', 'QR_ORDER', 'Sipariş ve Çağrı Yönetimi',
       '/admin#order.yonetim', (SELECT "group" FROM "app_screens" WHERE "code" = 'QS-KAS'),
       (SELECT COALESCE(MAX("sort_order"), 0) + 1 FROM "app_screens"), true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE EXISTS (SELECT 1 FROM "app_screens" WHERE "code" = 'QS-KAS')
  AND NOT EXISTS (SELECT 1 FROM "app_screens" WHERE "code" = 'QS-YON');
-- @data:end

-- @limits:begin
INSERT INTO "role_screen_permissions" ("id", "role_id", "screen_id", "hotel_id", "can_view", "can_create", "can_edit", "can_approve", "can_report", "created_at", "updated_at")
SELECT 'c' || substr(md5(random()::text || clock_timestamp()::text || r."id" || s."id"), 1, 24), r."id", s."id", NULL,
       true, true, true, true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "roles" r
JOIN "app_screens" s ON s."code" = 'QS-YON'
WHERE r."code" = 'R-SYS'
  AND NOT EXISTS (
    SELECT 1 FROM "role_screen_permissions" x
    WHERE x."role_id" = r."id" AND x."screen_id" = s."id" AND x."hotel_id" IS NULL
  );
-- @limits:end
