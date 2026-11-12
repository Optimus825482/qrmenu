-- KD (12 Kas 2026) — kademe: F&B Müdürü > F&B Müdür Yardımcısı > Oda Servisi Sorumlusu > saha rolleri.
-- Daha önce tohumlanmış veritabanları için (prisma/seed/roles.ts ROLES + SCREEN_LIMITS "KD" ile aynı sonuç):
--   R-FBY  F&B Müdür Yardımcısı (YONETIM, ISLET)   R-FBM ile aynı ekran hakları; kademede onun altında.
--   R-OSS  Oda Servisi Sorumlusu (YONETIM, ISLET)  minibar ve oda servisi ekranlarının tamamı V,O,D,A; MB-RAP ve
--          RO-SLA ayrıca R; CR-KOM / CR-RAD / CR-RAP V,R; CR-KUL V,O,D (yalnız kendi ekibinin rolleri: kodda
--          src/modules/core/roleRanks.ts).
--   R-FBM  minibar raporlarını tam alır (MB-RAP R eklendi).
-- Kimin kimi yönettiği veritabanında değil kodda durur (roleRanks.ts). Mevcut kullanıcıların rolü DEĞİŞMEZ:
-- yardımcılar R-FBY'ye sistem yöneticisi tarafından elle alınır.
-- Yalnız genel (hotel_id IS NULL) satırlar. Tekrarlanabilir. Yeni veritabanında app_screens henüz boşsa izin
-- blokları boşa döner; roller yine eklenir ve tohum aynı satırları yazar.

INSERT INTO "roles" ("id", "code", "name", "kind", "max_online_minutes", "default_screen", "is_system", "created_at", "updated_at")
SELECT 'c' || substr(md5(random()::text || clock_timestamp()::text || v.code), 1, 24), v.code, v.name, v.kind::"RoleKind",
       NULL, v.default_screen, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM (VALUES
  ('R-FBY', 'F&B Müdür Yardımcısı', 'YONETIM', 'CR-KOM'),
  ('R-OSS', 'Oda Servisi Sorumlusu', 'YONETIM', 'CR-KOM')
) AS v(code, name, kind, default_screen)
ON CONFLICT DO NOTHING;

INSERT INTO "role_module_accesses" ("id", "role_id", "hotel_id", "module_key", "enabled", "created_at", "updated_at")
SELECT 'c' || substr(md5(random()::text || clock_timestamp()::text || r."id" || v.module_key), 1, 24), r."id", NULL,
       v.module_key::"ModuleKey", true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM (VALUES
  ('R-FBY', 'CORE'), ('R-FBY', 'MINIBAR'), ('R-FBY', 'QR_MENU'), ('R-FBY', 'QR_ORDER'), ('R-FBY', 'ROOM_SERVICE'), ('R-OSS', 'CORE'), ('R-OSS', 'MINIBAR'), ('R-OSS', 'ROOM_SERVICE')
) AS v(role_code, module_key)
JOIN "roles" r ON r."code" = v.role_code
ON CONFLICT DO NOTHING;

-- @limits:begin
INSERT INTO "role_screen_permissions" ("id", "role_id", "screen_id", "hotel_id", "can_view", "can_create", "can_edit", "can_approve", "can_report", "created_at", "updated_at")
SELECT 'c' || substr(md5(random()::text || clock_timestamp()::text || r."id" || s."id"), 1, 24), r."id", s."id", NULL,
       v.cv, v.cc, v.ce, v.ca, v.cr, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM (VALUES
  ('R-FBY', 'MB-KAT', true, true, true, true, false),
  ('R-FBY', 'MB-KF', true, true, true, true, false),
  ('R-FBY', 'MB-TUK', true, true, true, true, false),
  ('R-FBY', 'MB-ZIM', true, true, true, true, false),
  ('R-FBY', 'MB-TAL', true, true, true, true, false),
  ('R-FBY', 'MB-DOL', true, true, true, true, false),
  ('R-FBY', 'MB-PERS', true, true, true, true, false),
  ('R-FBY', 'MB-DND', true, true, true, true, false),
  ('R-FBY', 'MB-RAP', true, true, true, true, true),
  ('R-FBY', 'MB-TAN', true, true, true, true, false),
  ('R-FBY', 'QM-MIS', true, true, true, true, false),
  ('R-FBY', 'QM-CAG', true, true, true, true, false),
  ('R-FBY', 'QM-MEN', true, true, true, true, false),
  ('R-FBY', 'QM-TEM', true, true, true, true, false),
  ('R-FBY', 'QM-RAP', true, true, true, true, true),
  ('R-FBY', 'QS-KUY', true, true, true, true, false),
  ('R-FBY', 'QS-KAS', true, true, true, true, false),
  ('R-FBY', 'QS-KDS', true, true, true, true, false),
  ('R-FBY', 'QS-FIS', true, true, true, true, false),
  ('R-FBY', 'QS-IPT', true, true, true, true, false),
  ('R-FBY', 'QS-RAP', true, true, true, true, true),
  ('R-FBY', 'RO-TAL', true, true, true, true, false),
  ('R-FBY', 'RO-TEL', true, true, true, true, false),
  ('R-FBY', 'RO-TES', true, true, true, true, false),
  ('R-FBY', 'RO-SLA', true, true, true, true, true),
  ('R-FBY', 'CR-KOM', true, false, false, false, true),
  ('R-FBY', 'CR-RAD', true, false, false, false, true),
  ('R-FBY', 'CR-ONL', true, false, false, true, true),
  ('R-FBY', 'CR-RAP', true, false, false, false, true),
  ('R-FBY', 'CR-KUL', true, true, true, false, false),
  ('R-FBY', 'CR-DEN', true, false, false, false, true),
  ('R-FBY', 'CR-TAN', true, true, true, false, false),
  ('R-FBY', 'CR-REH', true, true, true, false, false),
  ('R-OSS', 'MB-KAT', true, true, true, true, false),
  ('R-OSS', 'MB-KF', true, true, true, true, false),
  ('R-OSS', 'MB-TUK', true, true, true, true, false),
  ('R-OSS', 'MB-ZIM', true, true, true, true, false),
  ('R-OSS', 'MB-TAL', true, true, true, true, false),
  ('R-OSS', 'MB-DOL', true, true, true, true, false),
  ('R-OSS', 'MB-PERS', true, true, true, true, false),
  ('R-OSS', 'MB-DND', true, true, true, true, false),
  ('R-OSS', 'MB-RAP', true, true, true, true, true),
  ('R-OSS', 'MB-TAN', true, true, true, true, false),
  ('R-OSS', 'RO-TAL', true, true, true, true, false),
  ('R-OSS', 'RO-TEL', true, true, true, true, false),
  ('R-OSS', 'RO-TES', true, true, true, true, false),
  ('R-OSS', 'RO-SLA', true, true, true, true, true),
  ('R-OSS', 'CR-KOM', true, false, false, false, true),
  ('R-OSS', 'CR-RAD', true, false, false, false, true),
  ('R-OSS', 'CR-RAP', true, false, false, false, true),
  ('R-OSS', 'CR-KUL', true, true, true, false, false)
) AS v(role_code, screen_code, cv, cc, ce, ca, cr)
JOIN "roles" r ON r."code" = v.role_code
JOIN "app_screens" s ON s."code" = v.screen_code
ON CONFLICT DO NOTHING;

-- Bu iki rol bu migration ile doğar; genel matrisleri tohumunkiyle birebir olur. Otel bazlı satırlara dokunulmaz.
UPDATE "role_screen_permissions" p
SET "can_view" = v.cv, "can_create" = v.cc, "can_edit" = v.ce, "can_approve" = v.ca, "can_report" = v.cr,
    "updated_at" = CURRENT_TIMESTAMP
FROM (VALUES
  ('R-FBY', 'MB-KAT', true, true, true, true, false),
  ('R-FBY', 'MB-KF', true, true, true, true, false),
  ('R-FBY', 'MB-TUK', true, true, true, true, false),
  ('R-FBY', 'MB-ZIM', true, true, true, true, false),
  ('R-FBY', 'MB-TAL', true, true, true, true, false),
  ('R-FBY', 'MB-DOL', true, true, true, true, false),
  ('R-FBY', 'MB-PERS', true, true, true, true, false),
  ('R-FBY', 'MB-DND', true, true, true, true, false),
  ('R-FBY', 'MB-RAP', true, true, true, true, true),
  ('R-FBY', 'MB-TAN', true, true, true, true, false),
  ('R-FBY', 'QM-MIS', true, true, true, true, false),
  ('R-FBY', 'QM-CAG', true, true, true, true, false),
  ('R-FBY', 'QM-MEN', true, true, true, true, false),
  ('R-FBY', 'QM-TEM', true, true, true, true, false),
  ('R-FBY', 'QM-RAP', true, true, true, true, true),
  ('R-FBY', 'QS-KUY', true, true, true, true, false),
  ('R-FBY', 'QS-KAS', true, true, true, true, false),
  ('R-FBY', 'QS-KDS', true, true, true, true, false),
  ('R-FBY', 'QS-FIS', true, true, true, true, false),
  ('R-FBY', 'QS-IPT', true, true, true, true, false),
  ('R-FBY', 'QS-RAP', true, true, true, true, true),
  ('R-FBY', 'RO-TAL', true, true, true, true, false),
  ('R-FBY', 'RO-TEL', true, true, true, true, false),
  ('R-FBY', 'RO-TES', true, true, true, true, false),
  ('R-FBY', 'RO-SLA', true, true, true, true, true),
  ('R-FBY', 'CR-KOM', true, false, false, false, true),
  ('R-FBY', 'CR-RAD', true, false, false, false, true),
  ('R-FBY', 'CR-ONL', true, false, false, true, true),
  ('R-FBY', 'CR-RAP', true, false, false, false, true),
  ('R-FBY', 'CR-KUL', true, true, true, false, false),
  ('R-FBY', 'CR-DEN', true, false, false, false, true),
  ('R-FBY', 'CR-TAN', true, true, true, false, false),
  ('R-FBY', 'CR-REH', true, true, true, false, false),
  ('R-OSS', 'MB-KAT', true, true, true, true, false),
  ('R-OSS', 'MB-KF', true, true, true, true, false),
  ('R-OSS', 'MB-TUK', true, true, true, true, false),
  ('R-OSS', 'MB-ZIM', true, true, true, true, false),
  ('R-OSS', 'MB-TAL', true, true, true, true, false),
  ('R-OSS', 'MB-DOL', true, true, true, true, false),
  ('R-OSS', 'MB-PERS', true, true, true, true, false),
  ('R-OSS', 'MB-DND', true, true, true, true, false),
  ('R-OSS', 'MB-RAP', true, true, true, true, true),
  ('R-OSS', 'MB-TAN', true, true, true, true, false),
  ('R-OSS', 'RO-TAL', true, true, true, true, false),
  ('R-OSS', 'RO-TEL', true, true, true, true, false),
  ('R-OSS', 'RO-TES', true, true, true, true, false),
  ('R-OSS', 'RO-SLA', true, true, true, true, true),
  ('R-OSS', 'CR-KOM', true, false, false, false, true),
  ('R-OSS', 'CR-RAD', true, false, false, false, true),
  ('R-OSS', 'CR-RAP', true, false, false, false, true),
  ('R-OSS', 'CR-KUL', true, true, true, false, false)
) AS v(role_code, screen_code, cv, cc, ce, ca, cr), "roles" r, "app_screens" s
WHERE p."role_id" = r."id" AND p."screen_id" = s."id" AND p."hotel_id" IS NULL
  AND r."code" = v.role_code AND s."code" = v.screen_code
  AND (p."can_view", p."can_create", p."can_edit", p."can_approve", p."can_report") IS DISTINCT FROM (v.cv, v.cc, v.ce, v.ca, v.cr);

DELETE FROM "role_screen_permissions" p
USING "roles" r, "app_screens" s
WHERE p."role_id" = r."id" AND p."screen_id" = s."id" AND p."hotel_id" IS NULL
  AND r."code" IN ('R-FBY', 'R-OSS')
  AND (r."code", s."code") NOT IN (VALUES
    ('R-FBY', 'MB-KAT'), ('R-FBY', 'MB-KF'), ('R-FBY', 'MB-TUK'), ('R-FBY', 'MB-ZIM'), ('R-FBY', 'MB-TAL'),
    ('R-FBY', 'MB-DOL'), ('R-FBY', 'MB-PERS'), ('R-FBY', 'MB-DND'), ('R-FBY', 'MB-RAP'), ('R-FBY', 'MB-TAN'),
    ('R-FBY', 'QM-MIS'), ('R-FBY', 'QM-CAG'), ('R-FBY', 'QM-MEN'), ('R-FBY', 'QM-TEM'), ('R-FBY', 'QM-RAP'),
    ('R-FBY', 'QS-KUY'), ('R-FBY', 'QS-KAS'), ('R-FBY', 'QS-KDS'), ('R-FBY', 'QS-FIS'), ('R-FBY', 'QS-IPT'),
    ('R-FBY', 'QS-RAP'), ('R-FBY', 'RO-TAL'), ('R-FBY', 'RO-TEL'), ('R-FBY', 'RO-TES'), ('R-FBY', 'RO-SLA'),
    ('R-FBY', 'CR-KOM'), ('R-FBY', 'CR-RAD'), ('R-FBY', 'CR-ONL'), ('R-FBY', 'CR-RAP'), ('R-FBY', 'CR-KUL'),
    ('R-FBY', 'CR-DEN'), ('R-FBY', 'CR-TAN'), ('R-FBY', 'CR-REH'), ('R-OSS', 'MB-KAT'), ('R-OSS', 'MB-KF'),
    ('R-OSS', 'MB-TUK'), ('R-OSS', 'MB-ZIM'), ('R-OSS', 'MB-TAL'), ('R-OSS', 'MB-DOL'), ('R-OSS', 'MB-PERS'),
    ('R-OSS', 'MB-DND'), ('R-OSS', 'MB-RAP'), ('R-OSS', 'MB-TAN'), ('R-OSS', 'RO-TAL'), ('R-OSS', 'RO-TEL'),
    ('R-OSS', 'RO-TES'), ('R-OSS', 'RO-SLA'), ('R-OSS', 'CR-KOM'), ('R-OSS', 'CR-RAD'), ('R-OSS', 'CR-RAP'),
    ('R-OSS', 'CR-KUL'));

-- F&B Müdürü minibar raporlarını tam alır.
UPDATE "role_screen_permissions" p
SET "can_report" = true, "updated_at" = CURRENT_TIMESTAMP
FROM "roles" r, "app_screens" s
WHERE p."role_id" = r."id" AND p."screen_id" = s."id" AND p."hotel_id" IS NULL
  AND r."code" = 'R-FBM' AND s."code" = 'MB-RAP' AND p."can_report" = false;
-- @limits:end

-- Görev kataloğu: yardımcı görevi kendi rolünü önerir; Oda Servisi Sorumlusu görevi eklenir ve oda servisi
-- görevlisi ona bağlanır. Elle değiştirilmiş bir öneriye dokunulmaz.
UPDATE "job_titles" SET "default_role_id" = (SELECT "id" FROM "roles" WHERE "code" = 'R-FBY'), "updated_at" = now()
WHERE "code" = 'G-FBA' AND ("default_role_id" IS NULL OR "default_role_id" = (SELECT "id" FROM "roles" WHERE "code" = 'R-FBM'));

INSERT INTO "job_titles" ("id", "code", "name", "department", "parent_id", "default_role_id", "sort_order", "updated_at")
SELECT 'jt-g-oss', 'G-OSS', 'Oda Servisi Sorumlusu', 'YONETIM', (SELECT "id" FROM "job_titles" WHERE "code" = 'G-FBA'),
       (SELECT "id" FROM "roles" WHERE "code" = 'R-OSS'), 35, now()
WHERE NOT EXISTS (SELECT 1 FROM "job_titles" WHERE "code" = 'G-OSS' OR "name" = 'Oda Servisi Sorumlusu');

UPDATE "job_titles" SET "parent_id" = (SELECT "id" FROM "job_titles" WHERE "code" = 'G-OSS'), "updated_at" = now()
WHERE "code" = 'G-ODS' AND EXISTS (SELECT 1 FROM "job_titles" WHERE "code" = 'G-OSS');
