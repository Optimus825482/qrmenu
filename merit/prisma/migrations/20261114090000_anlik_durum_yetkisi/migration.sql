-- Anlık Durum (14 Kas 2026): the live counters widget gets its own screen, CR-DUR, so the permission matrix decides
-- who sees it on the desktop, the personel/tablet shell and the mobile shell. Until now the widget followed CR-KOM.
-- For databases seeded earlier: the screen row, then every CR-KOM permission (role, per hotel; user overrides)
-- copied as view + report, so nobody who saw the widget loses it. Fresh databases: the seed writes the same rows.
-- Repeatable.

-- @data:begin
INSERT INTO "app_screens" ("id", "code", "module_key", "name", "path", "group", "sort_order", "is_active", "created_at", "updated_at")
SELECT 'c' || substr(md5(random()::text || clock_timestamp()::text), 1, 24), 'CR-DUR', 'CORE', 'Anlık Durum', '/admin#core.durum',
       'Ortak / Çekirdek', (SELECT COALESCE(MAX("sort_order"), 0) + 1 FROM "app_screens"), true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE EXISTS (SELECT 1 FROM "app_screens")
  AND NOT EXISTS (SELECT 1 FROM "app_screens" WHERE "code" = 'CR-DUR');

-- Role rows (global and per hotel). hotel_id NULL is distinct in the unique index: NOT EXISTS, not ON CONFLICT.
INSERT INTO "role_screen_permissions" ("id", "role_id", "screen_id", "hotel_id", "can_view", "can_create", "can_edit", "can_approve", "can_report", "created_at", "updated_at")
SELECT 'c' || substr(md5(random()::text || clock_timestamp()::text || p."id"), 1, 24), p."role_id", d."id", p."hotel_id",
       p."can_view", (r."code" = 'R-SYS'), (r."code" = 'R-SYS'), (r."code" = 'R-SYS'), p."can_view", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "role_screen_permissions" p
JOIN "app_screens" k ON k."id" = p."screen_id" AND k."code" = 'CR-KOM'
JOIN "roles" r ON r."id" = p."role_id"
CROSS JOIN "app_screens" d
WHERE d."code" = 'CR-DUR'
  AND NOT EXISTS (
    SELECT 1 FROM "role_screen_permissions" x
    WHERE x."role_id" = p."role_id" AND x."screen_id" = d."id" AND x."hotel_id" IS NOT DISTINCT FROM p."hotel_id"
  );

-- User overrides of CR-KOM view carry over the same way (NULL = follows the role).
INSERT INTO "user_screen_permissions" ("id", "user_id", "screen_id", "can_view", "can_report", "created_at", "updated_at")
SELECT 'c' || substr(md5(random()::text || clock_timestamp()::text || u."id"), 1, 24), u."user_id", d."id", u."can_view", u."can_view",
       CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "user_screen_permissions" u
JOIN "app_screens" k ON k."id" = u."screen_id" AND k."code" = 'CR-KOM'
CROSS JOIN "app_screens" d
WHERE d."code" = 'CR-DUR' AND u."can_view" IS NOT NULL
ON CONFLICT ("user_id", "screen_id") DO NOTHING;
-- @data:end
