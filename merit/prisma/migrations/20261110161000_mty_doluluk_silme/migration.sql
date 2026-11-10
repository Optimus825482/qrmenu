-- R-MTY (Minibar Takip Yöneticisi) doluluk yüklemesini silebilir / geri alabilir: MB-DOL + D.
-- 20261110160000 bu satırı V,O ile ekler; burada yalnız düzenleme bayrağı açılır. Yalnız genel satır; tekrarlanabilir.
-- @limits:begin
UPDATE "role_screen_permissions" p
SET "can_edit" = true, "updated_at" = CURRENT_TIMESTAMP
FROM "roles" r, "app_screens" s
WHERE p."role_id" = r."id" AND p."screen_id" = s."id" AND p."hotel_id" IS NULL AND p."can_edit" = false
  AND r."code" = 'R-MTY' AND s."code" = 'MB-DOL';
-- @limits:end
