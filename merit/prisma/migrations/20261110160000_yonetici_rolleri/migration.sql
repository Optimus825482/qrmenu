-- YR (10 Kas 2026) — yönetici yardımcıları: sistem yöneticisinin dar yetkilerini devrettiği dört rol, daha önce
-- tohumlanmış veritabanları için (prisma/seed/roles.ts ROLES + SCREEN_LIMITS "YR" ile aynı sonuç):
--   R-MTY  Minibar Takip Yöneticisi (YONETIM, IZLE)  minibar ekranları V; MB-RAP V,R; MB-DOL V,O (doluluk yükler);
--          CR-KOM / CR-RAP V,R. Elle oda girişi ayarı kodda (manualRoomEntryAdmin.MANUAL_ENTRY_EDITOR_ROLES).
--   R-QMY  QR Menü Yöneticisi (YONETIM, ISLET)       QM-MEN / QM-TEM V,O,D; QM-RAP V,R; QM-MIS V; CR-KOM / CR-RAP V,R.
--   R-OUY  Outlet Yöneticisi (OUTLET, IZLE)          QS-KAS / QS-RAP V,R; CR-RAP V,R. Outlet'ler OutletMember ile atanır.
--   R-MUY  Mutfak Yöneticisi (MUTFAK, IZLE)          QS-KDS V; CR-RAP V,R.
-- Yalnız genel (hotel_id IS NULL) satırlar. Tekrarlanabilir. Yeni veritabanında app_screens henüz boşsa (tohum
-- sonradan çalışır) izin blokları boşa döner; roller yine eklenir ve tohum aynı satırları yazar.

INSERT INTO "roles" ("id", "code", "name", "kind", "max_online_minutes", "default_screen", "is_system", "created_at", "updated_at")
SELECT 'c' || substr(md5(random()::text || clock_timestamp()::text || v.code), 1, 24), v.code, v.name, v.kind::"RoleKind",
       NULL, v.default_screen, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM (VALUES
  ('R-MTY', 'Minibar Takip Yöneticisi', 'YONETIM', 'CR-KOM'),
  ('R-QMY', 'QR Menü Yöneticisi', 'YONETIM', 'CR-KOM'),
  ('R-OUY', 'Outlet Yöneticisi', 'OUTLET', 'QS-KAS'),
  ('R-MUY', 'Mutfak Yöneticisi', 'MUTFAK', 'QS-KDS')
) AS v(code, name, kind, default_screen)
ON CONFLICT DO NOTHING;

-- Modül erişimi (genel satırların kısmi tekil indeksi "role_module_access_global" çakışmayı yakalar).
INSERT INTO "role_module_accesses" ("id", "role_id", "hotel_id", "module_key", "enabled", "created_at", "updated_at")
SELECT 'c' || substr(md5(random()::text || clock_timestamp()::text || r."id" || v.module_key), 1, 24), r."id", NULL,
       v.module_key::"ModuleKey", true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM (VALUES
  ('R-MTY', 'CORE'), ('R-MTY', 'MINIBAR'),
  ('R-QMY', 'CORE'), ('R-QMY', 'QR_MENU'),
  ('R-OUY', 'QR_ORDER'),
  ('R-MUY', 'QR_ORDER')
) AS v(role_code, module_key)
JOIN "roles" r ON r."code" = v.role_code
ON CONFLICT DO NOTHING;

-- @limits:begin
-- Satır yoksa eklenir (genel satırların kısmi tekil indeksi "role_screen_permissions_global" çakışmayı yakalar).
INSERT INTO "role_screen_permissions" ("id", "role_id", "screen_id", "hotel_id", "can_view", "can_create", "can_edit", "can_approve", "can_report", "created_at", "updated_at")
SELECT 'c' || substr(md5(random()::text || clock_timestamp()::text || r."id" || s."id"), 1, 24), r."id", s."id", NULL,
       v.cv, v.cc, v.ce, v.ca, v.cr, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM (VALUES
  ('R-MTY', 'MB-KAT', true, false, false, false, false),
  ('R-MTY', 'MB-KF', true, false, false, false, false),
  ('R-MTY', 'MB-TUK', true, false, false, false, false),
  ('R-MTY', 'MB-ZIM', true, false, false, false, false),
  ('R-MTY', 'MB-TAL', true, false, false, false, false),
  ('R-MTY', 'MB-DOL', true, true, false, false, false),
  ('R-MTY', 'MB-PERS', true, false, false, false, false),
  ('R-MTY', 'MB-DND', true, false, false, false, false),
  ('R-MTY', 'MB-RAP', true, false, false, false, true),
  ('R-MTY', 'MB-TAN', true, false, false, false, false),
  ('R-MTY', 'CR-KOM', true, false, false, false, true),
  ('R-MTY', 'CR-RAP', true, false, false, false, true),
  ('R-QMY', 'QM-MIS', true, false, false, false, false),
  ('R-QMY', 'QM-MEN', true, true, true, false, false),
  ('R-QMY', 'QM-TEM', true, true, true, false, false),
  ('R-QMY', 'QM-RAP', true, false, false, false, true),
  ('R-QMY', 'CR-KOM', true, false, false, false, true),
  ('R-QMY', 'CR-RAP', true, false, false, false, true),
  ('R-OUY', 'QS-KAS', true, false, false, false, true),
  ('R-OUY', 'QS-RAP', true, false, false, false, true),
  ('R-OUY', 'CR-RAP', true, false, false, false, true),
  ('R-MUY', 'QS-KDS', true, false, false, false, false),
  ('R-MUY', 'CR-RAP', true, false, false, false, true)
) AS v(role_code, screen_code, cv, cc, ce, ca, cr)
JOIN "roles" r ON r."code" = v.role_code
JOIN "app_screens" s ON s."code" = v.screen_code
ON CONFLICT DO NOTHING;

-- Bu roller bu migration ile doğar; genel matrisleri tohumunkiyle birebir olur: önceden yazılmış farklı bir genel
-- satır düzeltilir, matriste olmayan genel satır kaldırılır. Otel bazlı satırlara dokunulmaz.
UPDATE "role_screen_permissions" p
SET "can_view" = v.cv, "can_create" = v.cc, "can_edit" = v.ce, "can_approve" = v.ca, "can_report" = v.cr,
    "updated_at" = CURRENT_TIMESTAMP
FROM (VALUES
  ('R-MTY', 'MB-KAT', true, false, false, false, false),
  ('R-MTY', 'MB-KF', true, false, false, false, false),
  ('R-MTY', 'MB-TUK', true, false, false, false, false),
  ('R-MTY', 'MB-ZIM', true, false, false, false, false),
  ('R-MTY', 'MB-TAL', true, false, false, false, false),
  ('R-MTY', 'MB-DOL', true, true, false, false, false),
  ('R-MTY', 'MB-PERS', true, false, false, false, false),
  ('R-MTY', 'MB-DND', true, false, false, false, false),
  ('R-MTY', 'MB-RAP', true, false, false, false, true),
  ('R-MTY', 'MB-TAN', true, false, false, false, false),
  ('R-MTY', 'CR-KOM', true, false, false, false, true),
  ('R-MTY', 'CR-RAP', true, false, false, false, true),
  ('R-QMY', 'QM-MIS', true, false, false, false, false),
  ('R-QMY', 'QM-MEN', true, true, true, false, false),
  ('R-QMY', 'QM-TEM', true, true, true, false, false),
  ('R-QMY', 'QM-RAP', true, false, false, false, true),
  ('R-QMY', 'CR-KOM', true, false, false, false, true),
  ('R-QMY', 'CR-RAP', true, false, false, false, true),
  ('R-OUY', 'QS-KAS', true, false, false, false, true),
  ('R-OUY', 'QS-RAP', true, false, false, false, true),
  ('R-OUY', 'CR-RAP', true, false, false, false, true),
  ('R-MUY', 'QS-KDS', true, false, false, false, false),
  ('R-MUY', 'CR-RAP', true, false, false, false, true)
) AS v(role_code, screen_code, cv, cc, ce, ca, cr), "roles" r, "app_screens" s
WHERE p."role_id" = r."id" AND p."screen_id" = s."id" AND p."hotel_id" IS NULL
  AND r."code" = v.role_code AND s."code" = v.screen_code
  AND (p."can_view", p."can_create", p."can_edit", p."can_approve", p."can_report") IS DISTINCT FROM (v.cv, v.cc, v.ce, v.ca, v.cr);

DELETE FROM "role_screen_permissions" p
USING "roles" r, "app_screens" s
WHERE p."role_id" = r."id" AND p."screen_id" = s."id" AND p."hotel_id" IS NULL
  AND r."code" IN ('R-MTY', 'R-QMY', 'R-OUY', 'R-MUY')
  AND (r."code", s."code") NOT IN (VALUES
    ('R-MTY', 'MB-KAT'), ('R-MTY', 'MB-KF'), ('R-MTY', 'MB-TUK'), ('R-MTY', 'MB-ZIM'), ('R-MTY', 'MB-TAL'),
    ('R-MTY', 'MB-DOL'), ('R-MTY', 'MB-PERS'), ('R-MTY', 'MB-DND'), ('R-MTY', 'MB-RAP'), ('R-MTY', 'MB-TAN'),
    ('R-MTY', 'CR-KOM'), ('R-MTY', 'CR-RAP'),
    ('R-QMY', 'QM-MIS'), ('R-QMY', 'QM-MEN'), ('R-QMY', 'QM-TEM'), ('R-QMY', 'QM-RAP'), ('R-QMY', 'CR-KOM'), ('R-QMY', 'CR-RAP'),
    ('R-OUY', 'QS-KAS'), ('R-OUY', 'QS-RAP'), ('R-OUY', 'CR-RAP'),
    ('R-MUY', 'QS-KDS'), ('R-MUY', 'CR-RAP'));
-- @limits:end
