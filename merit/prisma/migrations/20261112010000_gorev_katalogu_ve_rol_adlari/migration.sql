-- Gorev (resmi F&B unvani) ile rol (yetki ve arayuz profili) ayrildi.
-- 1) Gorev katalogu: hiyerarsi (parent_id) ve gorevin onerdigi varsayilan rol.
CREATE TABLE "job_titles" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "department" TEXT NOT NULL,
    "parent_id" TEXT,
    "default_role_id" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "job_titles_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "job_titles_code_key" ON "job_titles"("code");
CREATE UNIQUE INDEX "job_titles_name_key" ON "job_titles"("name");
CREATE INDEX "job_titles_parent_id_idx" ON "job_titles"("parent_id");

ALTER TABLE "job_titles" ADD CONSTRAINT "job_titles_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "job_titles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "job_titles" ADD CONSTRAINT "job_titles_default_role_id_fkey" FOREIGN KEY ("default_role_id") REFERENCES "roles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "users" ADD COLUMN "job_title_id" TEXT;
CREATE INDEX "users_job_title_id_idx" ON "users"("job_title_id");
ALTER TABLE "users" ADD CONSTRAINT "users_job_title_id_fkey" FOREIGN KEY ("job_title_id") REFERENCES "job_titles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 2) Taslak hiyerarsi. Ust gorevler once gelir; varsayilan rol, rol tablosu bossa (yeni kurulum) NULL kalir
--    ve seed tarafindan doldurulur.
INSERT INTO "job_titles" ("id", "code", "name", "department", "parent_id", "default_role_id", "sort_order", "updated_at") VALUES ('jt-g-otm', 'G-OTM', 'Otel Müdürü', 'YONETIM', NULL, (SELECT "id" FROM "roles" WHERE "code" = 'R-OTM'), 10, now());
INSERT INTO "job_titles" ("id", "code", "name", "department", "parent_id", "default_role_id", "sort_order", "updated_at") VALUES ('jt-g-fbm', 'G-FBM', 'F&B Müdürü', 'YONETIM', 'jt-g-otm', (SELECT "id" FROM "roles" WHERE "code" = 'R-FBM'), 20, now());
INSERT INTO "job_titles" ("id", "code", "name", "department", "parent_id", "default_role_id", "sort_order", "updated_at") VALUES ('jt-g-fba', 'G-FBA', 'F&B Müdür Yardımcısı', 'YONETIM', 'jt-g-fbm', (SELECT "id" FROM "roles" WHERE "code" = 'R-FBM'), 30, now());
INSERT INTO "job_titles" ("id", "code", "name", "department", "parent_id", "default_role_id", "sort_order", "updated_at") VALUES ('jt-g-srm', 'G-SRM', 'Servis Müdürü', 'YONETIM', 'jt-g-fba', (SELECT "id" FROM "roles" WHERE "code" = 'R-OUY'), 40, now());
INSERT INTO "job_titles" ("id", "code", "name", "department", "parent_id", "default_role_id", "sort_order", "updated_at") VALUES ('jt-g-rsm', 'G-RSM', 'Restoran Müdürü', 'YONETIM', 'jt-g-fba', (SELECT "id" FROM "roles" WHERE "code" = 'R-OUY'), 50, now());
INSERT INTO "job_titles" ("id", "code", "name", "department", "parent_id", "default_role_id", "sort_order", "updated_at") VALUES ('jt-g-oum', 'G-OUM', 'Outlet Müdürü', 'YONETIM', 'jt-g-fba', (SELECT "id" FROM "roles" WHERE "code" = 'R-OUY'), 60, now());
INSERT INTO "job_titles" ("id", "code", "name", "department", "parent_id", "default_role_id", "sort_order", "updated_at") VALUES ('jt-g-ouy', 'G-OUY', 'Outlet Yöneticisi', 'YONETIM', 'jt-g-oum', (SELECT "id" FROM "roles" WHERE "code" = 'R-OUY'), 70, now());
INSERT INTO "job_titles" ("id", "code", "name", "department", "parent_id", "default_role_id", "sort_order", "updated_at") VALUES ('jt-g-brm', 'G-BRM', 'Bar Müdürü', 'YONETIM', 'jt-g-fba', (SELECT "id" FROM "roles" WHERE "code" = 'R-OUY'), 80, now());
INSERT INTO "job_titles" ("id", "code", "name", "department", "parent_id", "default_role_id", "sort_order", "updated_at") VALUES ('jt-g-qmy', 'G-QMY', 'QR Menü Yöneticisi', 'YONETIM', 'jt-g-fba', (SELECT "id" FROM "roles" WHERE "code" = 'R-QMY'), 90, now());
INSERT INTO "job_titles" ("id", "code", "name", "department", "parent_id", "default_role_id", "sort_order", "updated_at") VALUES ('jt-g-ous', 'G-OUS', 'Outlet Şefi', 'SERVIS', 'jt-g-oum', (SELECT "id" FROM "roles" WHERE "code" = 'R-SGF'), 100, now());
INSERT INTO "job_titles" ("id", "code", "name", "department", "parent_id", "default_role_id", "sort_order", "updated_at") VALUES ('jt-g-rss', 'G-RSS', 'Restoran Şefi', 'SERVIS', 'jt-g-rsm', (SELECT "id" FROM "roles" WHERE "code" = 'R-SGF'), 110, now());
INSERT INTO "job_titles" ("id", "code", "name", "department", "parent_id", "default_role_id", "sort_order", "updated_at") VALUES ('jt-g-ssv', 'G-SSV', 'Servis Süpervizörü', 'SERVIS', 'jt-g-srm', (SELECT "id" FROM "roles" WHERE "code" = 'R-SGF'), 120, now());
INSERT INTO "job_titles" ("id", "code", "name", "department", "parent_id", "default_role_id", "sort_order", "updated_at") VALUES ('jt-g-sgf', 'G-SGF', 'Şef Garson', 'SERVIS', 'jt-g-ous', (SELECT "id" FROM "roles" WHERE "code" = 'R-SGF'), 130, now());
INSERT INTO "job_titles" ("id", "code", "name", "department", "parent_id", "default_role_id", "sort_order", "updated_at") VALUES ('jt-g-gar', 'G-GAR', 'Garson', 'SERVIS', 'jt-g-sgf', (SELECT "id" FROM "roles" WHERE "code" = 'R-GAR'), 140, now());
INSERT INTO "job_titles" ("id", "code", "name", "department", "parent_id", "default_role_id", "sort_order", "updated_at") VALUES ('jt-g-kom', 'G-KOM', 'Komi', 'SERVIS', 'jt-g-gar', (SELECT "id" FROM "roles" WHERE "code" = 'R-GAR'), 150, now());
INSERT INTO "job_titles" ("id", "code", "name", "department", "parent_id", "default_role_id", "sort_order", "updated_at") VALUES ('jt-g-run', 'G-RUN', 'Runner', 'SERVIS', 'jt-g-gar', (SELECT "id" FROM "roles" WHERE "code" = 'R-GAR'), 160, now());
INSERT INTO "job_titles" ("id", "code", "name", "department", "parent_id", "default_role_id", "sort_order", "updated_at") VALUES ('jt-g-hos', 'G-HOS', 'Host / Hostes', 'SERVIS', 'jt-g-sgf', (SELECT "id" FROM "roles" WHERE "code" = 'R-OUT'), 170, now());
INSERT INTO "job_titles" ("id", "code", "name", "department", "parent_id", "default_role_id", "sort_order", "updated_at") VALUES ('jt-g-kas', 'G-KAS', 'Kasiyer', 'SERVIS', 'jt-g-oum', (SELECT "id" FROM "roles" WHERE "code" = 'R-KAS'), 180, now());
INSERT INTO "job_titles" ("id", "code", "name", "department", "parent_id", "default_role_id", "sort_order", "updated_at") VALUES ('jt-g-ods', 'G-ODS', 'Oda Servisi Görevlisi', 'SERVIS', 'jt-g-srm', (SELECT "id" FROM "roles" WHERE "code" = 'R-ODS'), 190, now());
INSERT INTO "job_titles" ("id", "code", "name", "department", "parent_id", "default_role_id", "sort_order", "updated_at") VALUES ('jt-g-but', 'G-BUT', 'Butler (VIP)', 'SERVIS', 'jt-g-srm', (SELECT "id" FROM "roles" WHERE "code" = 'R-BUT'), 200, now());
INSERT INTO "job_titles" ("id", "code", "name", "department", "parent_id", "default_role_id", "sort_order", "updated_at") VALUES ('jt-g-bar', 'G-BAR', 'Barmen / Barmaid', 'BAR', 'jt-g-brm', (SELECT "id" FROM "roles" WHERE "code" = 'R-BAR'), 210, now());
INSERT INTO "job_titles" ("id", "code", "name", "department", "parent_id", "default_role_id", "sort_order", "updated_at") VALUES ('jt-g-brs', 'G-BRS', 'Barista', 'BAR', 'jt-g-brm', (SELECT "id" FROM "roles" WHERE "code" = 'R-BAR'), 220, now());
INSERT INTO "job_titles" ("id", "code", "name", "department", "parent_id", "default_role_id", "sort_order", "updated_at") VALUES ('jt-g-mus', 'G-MUS', 'Mutfak Şefi', 'MUTFAK', 'jt-g-fbm', (SELECT "id" FROM "roles" WHERE "code" = 'R-MUS'), 230, now());
INSERT INTO "job_titles" ("id", "code", "name", "department", "parent_id", "default_role_id", "sort_order", "updated_at") VALUES ('jt-g-muy', 'G-MUY', 'Mutfak Yöneticisi', 'MUTFAK', 'jt-g-mus', (SELECT "id" FROM "roles" WHERE "code" = 'R-MUY'), 240, now());
INSERT INTO "job_titles" ("id", "code", "name", "department", "parent_id", "default_role_id", "sort_order", "updated_at") VALUES ('jt-g-sou', 'G-SOU', 'Sous Chef', 'MUTFAK', 'jt-g-mus', (SELECT "id" FROM "roles" WHERE "code" = 'R-MUS'), 250, now());
INSERT INTO "job_titles" ("id", "code", "name", "department", "parent_id", "default_role_id", "sort_order", "updated_at") VALUES ('jt-g-dcp', 'G-DCP', 'Demi Chef de Partie', 'MUTFAK', 'jt-g-sou', (SELECT "id" FROM "roles" WHERE "code" = 'R-MUP'), 260, now());
INSERT INTO "job_titles" ("id", "code", "name", "department", "parent_id", "default_role_id", "sort_order", "updated_at") VALUES ('jt-g-asc', 'G-ASC', 'Aşçı', 'MUTFAK', 'jt-g-sou', (SELECT "id" FROM "roles" WHERE "code" = 'R-MUP'), 270, now());
INSERT INTO "job_titles" ("id", "code", "name", "department", "parent_id", "default_role_id", "sort_order", "updated_at") VALUES ('jt-g-pas', 'G-PAS', 'Pastacı', 'MUTFAK', 'jt-g-sou', (SELECT "id" FROM "roles" WHERE "code" = 'R-MUP'), 280, now());
INSERT INTO "job_titles" ("id", "code", "name", "department", "parent_id", "default_role_id", "sort_order", "updated_at") VALUES ('jt-g-com', 'G-COM', 'Commis / Aşçı Yardımcısı', 'MUTFAK', 'jt-g-asc', (SELECT "id" FROM "roles" WHERE "code" = 'R-MUP'), 290, now());
INSERT INTO "job_titles" ("id", "code", "name", "department", "parent_id", "default_role_id", "sort_order", "updated_at") VALUES ('jt-g-mup', 'G-MUP', 'Mutfak Personeli', 'MUTFAK', 'jt-g-asc', (SELECT "id" FROM "roles" WHERE "code" = 'R-MUP'), 300, now());
INSERT INTO "job_titles" ("id", "code", "name", "department", "parent_id", "default_role_id", "sort_order", "updated_at") VALUES ('jt-g-stw', 'G-STW', 'Steward / Bulaşıkhane Görevlisi', 'MUTFAK', 'jt-g-mus', (SELECT "id" FROM "roles" WHERE "code" = 'R-MUP'), 310, now());
INSERT INTO "job_titles" ("id", "code", "name", "department", "parent_id", "default_role_id", "sort_order", "updated_at") VALUES ('jt-g-kds', 'G-KDS', 'KDS Operatörü', 'MUTFAK', 'jt-g-mus', (SELECT "id" FROM "roles" WHERE "code" = 'R-KDS'), 320, now());
INSERT INTO "job_titles" ("id", "code", "name", "department", "parent_id", "default_role_id", "sort_order", "updated_at") VALUES ('jt-g-mty', 'G-MTY', 'Minibar Takip Yöneticisi', 'MINIBAR', 'jt-g-fba', (SELECT "id" FROM "roles" WHERE "code" = 'R-MTY'), 330, now());
INSERT INTO "job_titles" ("id", "code", "name", "department", "parent_id", "default_role_id", "sort_order", "updated_at") VALUES ('jt-g-mts', 'G-MTS', 'Minibar Takip Süpervizör', 'MINIBAR', 'jt-g-mty', (SELECT "id" FROM "roles" WHERE "code" = 'R-HKS'), 340, now());
INSERT INTO "job_titles" ("id", "code", "name", "department", "parent_id", "default_role_id", "sort_order", "updated_at") VALUES ('jt-g-mtd', 'G-MTD', 'Minibar Takip Depo Sorumlusu', 'MINIBAR', 'jt-g-mts', (SELECT "id" FROM "roles" WHERE "code" = 'R-DEP'), 350, now());
INSERT INTO "job_titles" ("id", "code", "name", "department", "parent_id", "default_role_id", "sort_order", "updated_at") VALUES ('jt-g-mtk', 'G-MTK', 'Minibar Takip Kat Sorumlusu', 'MINIBAR', 'jt-g-mts', (SELECT "id" FROM "roles" WHERE "code" = 'R-KAT'), 360, now());
INSERT INTO "job_titles" ("id", "code", "name", "department", "parent_id", "default_role_id", "sort_order", "updated_at") VALUES ('jt-g-mto', 'G-MTO', 'Minibar Takip Operasyonu', 'MINIBAR', 'jt-g-mts', (SELECT "id" FROM "roles" WHERE "code" = 'R-KAT'), 370, now());
INSERT INTO "job_titles" ("id", "code", "name", "department", "parent_id", "default_role_id", "sort_order", "updated_at") VALUES ('jt-g-mgr', 'G-MGR', 'Minibar Garson', 'MINIBAR', 'jt-g-mtk', (SELECT "id" FROM "roles" WHERE "code" = 'R-KAT'), 380, now());
INSERT INTO "job_titles" ("id", "code", "name", "department", "parent_id", "default_role_id", "sort_order", "updated_at") VALUES ('jt-g-sys', 'G-SYS', 'Sistem Yöneticisi', 'SISTEM', NULL, (SELECT "id" FROM "roles" WHERE "code" = 'R-SYS'), 390, now());
INSERT INTO "job_titles" ("id", "code", "name", "department", "parent_id", "default_role_id", "sort_order", "updated_at") VALUES ('jt-g-itt', 'G-ITT', 'BT Destek Sorumlusu', 'SISTEM', 'jt-g-sys', (SELECT "id" FROM "roles" WHERE "code" = 'R-ITT'), 400, now());

-- 3) Eski unvan metni yeni adina cekilir.
UPDATE "users" SET "job_title" = 'F&B Müdür Yardımcısı' WHERE btrim("job_title") = 'F&B Manager Assistant';

-- 4) Katalogda olmayan, kullanimdaki serbest metin unvanlar "Diger" bolumune eklenir (hicbir kullanici gorevsiz kalmaz).
INSERT INTO "job_titles" ("id", "code", "name", "department", "sort_order", "updated_at")
SELECT 'jt-x-' || md5(t), 'G-X' || upper(substr(md5(t), 1, 6)), t, 'DIGER', 900, now()
FROM (SELECT DISTINCT btrim("job_title") AS t FROM "users" WHERE "deleted_at" IS NULL AND COALESCE(btrim("job_title"), '') <> '') s
WHERE NOT EXISTS (SELECT 1 FROM "job_titles" j WHERE j."name" = s.t);

-- 5) Kullanicilar gorev kaydina baglanir.
UPDATE "users" u SET "job_title_id" = j."id" FROM "job_titles" j WHERE btrim(u."job_title") = j."name";

-- 6) Roller unvan degil yetki profili olarak adlandirilir. Kod ve yetkiler ayni kalir; yoneticinin
--    elle degistirdigi adlara dokunulmaz (yalniz eski yerlesik ad eslesirse).
UPDATE "roles" SET "name" = 'Otel Yönetimi (Raporlar)', "updated_at" = now() WHERE "code" = 'R-OTM' AND "name" = 'Otel Müdürü';
UPDATE "roles" SET "name" = 'F&B Yönetimi', "updated_at" = now() WHERE "code" = 'R-FBM' AND "name" = 'F&B Müdürü';
UPDATE "roles" SET "name" = 'Servis Süpervizyonu', "updated_at" = now() WHERE "code" = 'R-SGF' AND "name" = 'Şef Garson / Süpervizör';
UPDATE "roles" SET "name" = 'Servis Personeli', "updated_at" = now() WHERE "code" = 'R-GAR' AND "name" = 'Garson';
UPDATE "roles" SET "name" = 'Bar Personeli', "updated_at" = now() WHERE "code" = 'R-BAR' AND "name" = 'Barmen';
UPDATE "roles" SET "name" = 'VIP Servis Personeli', "updated_at" = now() WHERE "code" = 'R-BUT' AND "name" = 'Butler (VIP)';
UPDATE "roles" SET "name" = 'Çağrı Karşılama', "updated_at" = now() WHERE "code" = 'R-OUT' AND "name" = 'Outlet Görevlisi';
UPDATE "roles" SET "name" = 'Oda Servisi Personeli', "updated_at" = now() WHERE "code" = 'R-ODS' AND "name" = 'Oda Servisi Görevlisi';
UPDATE "roles" SET "name" = 'Mutfak Süpervizyonu', "updated_at" = now() WHERE "code" = 'R-MUS' AND "name" = 'Mutfak Şefi';
UPDATE "roles" SET "name" = 'Mutfak Ekranı (KDS)', "updated_at" = now() WHERE "code" = 'R-KDS' AND "name" = 'KDS Operatörü';
UPDATE "roles" SET "name" = 'Minibar Kat Personeli', "updated_at" = now() WHERE "code" = 'R-KAT' AND "name" = 'Minibar Garson';
UPDATE "roles" SET "name" = 'Minibar Depo', "updated_at" = now() WHERE "code" = 'R-DEP' AND "name" = 'Depo Sorumlusu';
UPDATE "roles" SET "name" = 'Minibar İzleme', "updated_at" = now() WHERE "code" = 'R-HKS' AND "name" = 'Housekeeping Süpervizörü';
UPDATE "roles" SET "name" = 'Minibar Yönetimi', "updated_at" = now() WHERE "code" = 'R-MTY' AND "name" = 'Minibar Takip Yöneticisi';
UPDATE "roles" SET "name" = 'QR Menü Yönetimi', "updated_at" = now() WHERE "code" = 'R-QMY' AND "name" = 'QR Menü Yöneticisi';
UPDATE "roles" SET "name" = 'Outlet İzleme', "updated_at" = now() WHERE "code" = 'R-OUY' AND "name" = 'Outlet Yöneticisi';
UPDATE "roles" SET "name" = 'Mutfak İzleme', "updated_at" = now() WHERE "code" = 'R-MUY' AND "name" = 'Mutfak Yöneticisi';
