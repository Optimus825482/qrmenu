-- Minibar Yonetimi (R-MTY) minibar tanimlarini da yonetir: urun grubu, urun, setup ve setup icerigi ekler,
-- duzenler, pasife alir (MB-TAN: goruntule + olustur + duzenle). Silme sistem yoneticisinde kalir; sistem geneli
-- yazma izni kodda rol koduyla verilir (catalogCommon.CATALOG_MANAGER_ROLES).
-- @limits:begin
UPDATE "role_screen_permissions" p
SET "can_create" = true, "can_edit" = true, "updated_at" = CURRENT_TIMESTAMP
FROM "roles" r, "app_screens" s
WHERE p."role_id" = r."id" AND p."screen_id" = s."id" AND p."hotel_id" IS NULL
  AND r."code" = 'R-MTY' AND s."code" = 'MB-TAN';
-- @limits:end

-- Bir ay boyunca Minibar Yonetimi otel deposu sayim duzeltmesini sistem yoneticisi onayi beklemeden dogrudan
-- isler (genel ayar; pool.mayCorrectDirectly okur). Sure bu migration'in calistigi andan baslar; sure dolunca
-- duzeltmeler yeniden onaya gider (stockCorrections.ts). Tekrar calisirsa mevcut tarih degismez.
INSERT INTO "settings" ("id", "hotel_id", "key", "value", "created_at", "updated_at")
SELECT 'c' || substr(md5(random()::text || clock_timestamp()::text), 1, 24), NULL, 'minibar.directCorrectionUntil',
       to_jsonb(to_char((CURRENT_TIMESTAMP + INTERVAL '1 month') AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')), CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "settings" WHERE "hotel_id" IS NULL AND "key" = 'minibar.directCorrectionUntil');
