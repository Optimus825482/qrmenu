-- Merit'in servis kademeleri görev kataloğuna eklenir (13.11.2026 personel listesi). Üst görev koduyla bulunur:
-- katalog satırları kurulumdan kuruluma farklı kimlik taşıyabilir. Aynı kod ya da ad zaten varsa satır atlanır.

INSERT INTO "job_titles" ("id", "code", "name", "department", "parent_id", "default_role_id", "sort_order", "updated_at")
  SELECT 'jt-g-mdh', 'G-MDH', 'Maître d''Hôtel', 'SERVIS', (SELECT "id" FROM "job_titles" WHERE "code" = 'G-FBA'), (SELECT "id" FROM "roles" WHERE "code" = 'R-SGF'), 131, now()
  WHERE NOT EXISTS (SELECT 1 FROM "job_titles" WHERE "code" = 'G-MDH' OR lower("name") = lower('Maître d''Hôtel'));
INSERT INTO "job_titles" ("id", "code", "name", "department", "parent_id", "default_role_id", "sort_order", "updated_at")
  SELECT 'jt-g-hdw', 'G-HDW', 'Headwaiter', 'SERVIS', (SELECT "id" FROM "job_titles" WHERE "code" = 'G-FBA'), (SELECT "id" FROM "roles" WHERE "code" = 'R-SGF'), 132, now()
  WHERE NOT EXISTS (SELECT 1 FROM "job_titles" WHERE "code" = 'G-HDW' OR lower("name") = lower('Headwaiter'));
INSERT INTO "job_titles" ("id", "code", "name", "department", "parent_id", "default_role_id", "sort_order", "updated_at")
  SELECT 'jt-g-sup', 'G-SUP', 'Supervisor', 'SERVIS', (SELECT "id" FROM "job_titles" WHERE "code" = 'G-HDW'), (SELECT "id" FROM "roles" WHERE "code" = 'R-SGF'), 133, now()
  WHERE NOT EXISTS (SELECT 1 FROM "job_titles" WHERE "code" = 'G-SUP' OR lower("name") = lower('Supervisor'));
INSERT INTO "job_titles" ("id", "code", "name", "department", "parent_id", "default_role_id", "sort_order", "updated_at")
  SELECT 'jt-g-cpt', 'G-CPT', 'Captain', 'SERVIS', (SELECT "id" FROM "job_titles" WHERE "code" = 'G-SUP'), (SELECT "id" FROM "roles" WHERE "code" = 'R-GAR'), 134, now()
  WHERE NOT EXISTS (SELECT 1 FROM "job_titles" WHERE "code" = 'G-CPT' OR lower("name") = lower('Captain'));
INSERT INTO "job_titles" ("id", "code", "name", "department", "parent_id", "default_role_id", "sort_order", "updated_at")
  SELECT 'jt-g-jcp', 'G-JCP', 'Junior Captain', 'SERVIS', (SELECT "id" FROM "job_titles" WHERE "code" = 'G-CPT'), (SELECT "id" FROM "roles" WHERE "code" = 'R-GAR'), 135, now()
  WHERE NOT EXISTS (SELECT 1 FROM "job_titles" WHERE "code" = 'G-JCP' OR lower("name") = lower('Junior Captain'));
INSERT INTO "job_titles" ("id", "code", "name", "department", "parent_id", "default_role_id", "sort_order", "updated_at")
  SELECT 'jt-g-inc', 'G-INC', 'Incharge (A La Carte Waiter)', 'SERVIS', (SELECT "id" FROM "job_titles" WHERE "code" = 'G-CPT'), (SELECT "id" FROM "roles" WHERE "code" = 'R-GAR'), 136, now()
  WHERE NOT EXISTS (SELECT 1 FROM "job_titles" WHERE "code" = 'G-INC' OR lower("name") = lower('Incharge (A La Carte Waiter)'));

-- 'F&B Asst. Manager' katalogdaki 'F&B Müdür Yardımcısı' ile aynı görevdir.
UPDATE "users" SET "job_title" = 'F&B Müdür Yardımcısı' WHERE btrim("job_title") = 'F&B Asst. Manager';

-- Görevi metin olarak taşıyan kullanıcılar yeni satırlara bağlanır.
UPDATE "users" u SET "job_title_id" = j."id"
  FROM "job_titles" j
  WHERE u."job_title_id" IS NULL AND u."job_title" IS NOT NULL AND lower(btrim(u."job_title")) = lower(j."name");
