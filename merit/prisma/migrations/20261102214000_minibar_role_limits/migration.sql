-- Minibar permission limits for the floor supervisor (R-KAT). Mirrors P3_SCREEN_LIMITS in prisma/seed/roles.ts.
-- Fresh databases have no rows here (the seed runs after the migrations and already applies the limits).

-- Minibar definitions and occupancy upload: no access at all.
DELETE FROM "role_screen_permissions" p USING "roles" r, "app_screens" s
WHERE p."role_id" = r."id" AND p."screen_id" = s."id" AND p."hotel_id" IS NULL
  AND r."code" = 'R-KAT' AND s."code" IN ('MB-TAN', 'MB-DOL');

-- Pool: view + critical-level update (D) only.
UPDATE "role_screen_permissions" p
SET "can_create" = false, "can_approve" = false, "can_report" = false
FROM "roles" r, "app_screens" s
WHERE p."role_id" = r."id" AND p."screen_id" = s."id" AND p."hotel_id" IS NULL
  AND r."code" = 'R-KAT' AND s."code" = 'MB-ZIM';
