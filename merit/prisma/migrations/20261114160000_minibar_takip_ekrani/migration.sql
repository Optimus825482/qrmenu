-- Minibar Takip (14 Kas 2026): the room-service team follows the minibar room checks on a read-only floor grid
-- (same colours as the Komuta Merkezi "Kat" view), every hotel selectable. Its own screen, RO-MBT (V only), so the
-- Yetki Matrisi decides who has it. A ROOM_SERVICE screen: the room-service roles do not hold the MINIBAR module.
-- For databases seeded earlier: the screen row, then the default grants of prisma/seed/roles.ts (SCREEN_LIMITS "MBT"):
--   R-SYS  V, O, D, A, R (modules ALL)      R-ODS, R-OSS, R-FBM, R-FBY  V      nobody else.
-- Fresh databases: the seed writes the same rows. Global (hotel_id IS NULL) rows only. Repeatable; a row an
-- administrator has changed since is not touched (the grants are inserted only when missing).

-- @data:begin
INSERT INTO "app_screens" ("id", "code", "module_key", "name", "path", "group", "sort_order", "is_active", "created_at", "updated_at")
SELECT 'c' || substr(md5(random()::text || clock_timestamp()::text), 1, 24), 'RO-MBT', 'ROOM_SERVICE', 'Minibar Takip',
       '/oda-servisi/minibar-takip', 'QR Oda Servisi', (SELECT COALESCE(MAX("sort_order"), 0) + 1 FROM "app_screens"), true,
       CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE EXISTS (SELECT 1 FROM "app_screens")
  AND NOT EXISTS (SELECT 1 FROM "app_screens" WHERE "code" = 'RO-MBT');
-- @data:end

-- @limits:begin
INSERT INTO "role_screen_permissions" ("id", "role_id", "screen_id", "hotel_id", "can_view", "can_create", "can_edit", "can_approve", "can_report", "created_at", "updated_at")
SELECT 'c' || substr(md5(random()::text || clock_timestamp()::text || r."id" || s."id"), 1, 24), r."id", s."id", NULL,
       true, r."code" = 'R-SYS', r."code" = 'R-SYS', r."code" = 'R-SYS', r."code" = 'R-SYS', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "roles" r
JOIN "app_screens" s ON s."code" = 'RO-MBT'
WHERE r."code" IN ('R-SYS', 'R-ODS', 'R-OSS', 'R-FBM', 'R-FBY')
  AND NOT EXISTS (
    SELECT 1 FROM "role_screen_permissions" x
    WHERE x."role_id" = r."id" AND x."screen_id" = s."id" AND x."hotel_id" IS NULL
  );
-- @limits:end
