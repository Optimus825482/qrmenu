-- R-MTY (Minibar Yonetimi) Operasyon Radarini izler: CR-RAD V,R. Radar sunucuda bu rol icin yalniz MINIBAR
-- katmanina indirilir (src/modules/radar/server/scope.ts MINIBAR_ONLY_ROLES). Yalniz genel satir; tekrarlanabilir.
-- @limits:begin
INSERT INTO "role_screen_permissions" ("id", "role_id", "screen_id", "hotel_id", "can_view", "can_create", "can_edit", "can_approve", "can_report", "created_at", "updated_at")
SELECT 'c' || substr(md5(random()::text || clock_timestamp()::text || r."id" || s."id"), 1, 24), r."id", s."id", NULL,
       true, false, false, false, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "roles" r, "app_screens" s
WHERE r."code" = 'R-MTY' AND s."code" = 'CR-RAD'
ON CONFLICT DO NOTHING;

UPDATE "role_screen_permissions" p
SET "can_view" = true, "can_report" = true, "updated_at" = CURRENT_TIMESTAMP
FROM "roles" r, "app_screens" s
WHERE p."role_id" = r."id" AND p."screen_id" = s."id" AND p."hotel_id" IS NULL
  AND r."code" = 'R-MTY' AND s."code" = 'CR-RAD' AND (p."can_view" = false OR p."can_report" = false);
-- @limits:end
