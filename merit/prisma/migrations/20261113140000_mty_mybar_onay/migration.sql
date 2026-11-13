-- Minibar Takip Yoneticisi (R-MTY) MyBar taleplerini onaylar ve tamamlar (MB-PERS: goruntule + duzenle).
-- Bildirim bu role de gidiyordu ama rol yalniz goruntuleyebildigi icin talebi onaylayamiyordu. Iptal (A) verilmez.
-- @limits:begin
UPDATE "role_screen_permissions" p
SET "can_edit" = true, "updated_at" = CURRENT_TIMESTAMP
FROM "roles" r, "app_screens" s
WHERE p."role_id" = r."id" AND p."screen_id" = s."id" AND p."hotel_id" IS NULL
  AND r."code" = 'R-MTY' AND s."code" = 'MB-PERS';
-- @limits:end
