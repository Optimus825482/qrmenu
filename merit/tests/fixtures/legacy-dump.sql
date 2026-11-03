-- Small synthetic dump of the legacy minibarlatest tables the migration reads (definitions step).
-- Loaded by tests/helpers/legacyFixture.ts into a scratch schema (search_path is set by the loader).
-- No real data: names, tokens and logos are made up. Deliberately includes the dirty shapes the migration must survive.

CREATE TABLE oteller (
  id integer NOT NULL, ad varchar NOT NULL, adres text, telefon varchar, email varchar, vergi_no varchar,
  aktif boolean, logo text, email_bildirim_aktif boolean, email_uyari_aktif boolean,
  email_rapor_aktif boolean, email_sistem_aktif boolean
);
CREATE TABLE katlar (
  id integer NOT NULL, otel_id integer NOT NULL, kat_adi varchar NOT NULL, kat_no integer NOT NULL, aktif boolean
);
CREATE TABLE oda_tipleri (
  id integer NOT NULL, ad varchar NOT NULL, aktif boolean, dolap_sayisi integer
);
CREATE TABLE odalar (
  id integer NOT NULL, kat_id integer, oda_no varchar NOT NULL, kapasite integer, aktif boolean,
  qr_kod_token varchar, qr_kod_gorsel text, qr_kod_olusturma_tarihi timestamp, misafir_mesaji varchar, oda_tipi_id integer
);
CREATE TABLE urun_gruplari (
  id integer NOT NULL, grup_adi varchar NOT NULL, aciklama text, aktif boolean
);
CREATE TABLE urunler (
  id integer NOT NULL, grup_id integer NOT NULL, urun_adi varchar NOT NULL, barkod varchar, birim varchar,
  kritik_stok_seviyesi integer, aktif boolean, urun_kodu varchar, satis_fiyati numeric, alis_fiyati numeric,
  kar_tutari numeric, kar_orani numeric
);
CREATE TABLE setuplar (
  id integer NOT NULL, ad varchar NOT NULL, aciklama varchar, aktif boolean, dolap_ici boolean
);
CREATE TABLE setup_icerik (
  id integer NOT NULL, setup_id integer NOT NULL, urun_id integer NOT NULL, adet integer NOT NULL
);
CREATE TABLE oda_tipi_setup (
  otel_id integer NOT NULL, oda_tipi_id integer NOT NULL, setup_id integer NOT NULL
);

-- Hotels: Diamond has a valid 1x1 PNG logo, Royal an invalid one, Premium none.
INSERT INTO oteller (id, ad, adres, telefon, aktif, logo, email_bildirim_aktif, email_uyari_aktif, email_rapor_aktif, email_sistem_aktif) VALUES
  (1, 'Merit Royal Diamond', 'Girne', '+90 392 000 00 01', true,
   'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
   true, true, false, false),
  (3, 'Merit Royal Premium', NULL, NULL, true, NULL, false, false, false, false),
  (4, 'Merit Royal Hotel', 'Girne', NULL, true, 'not-base64!!', true, false, true, false);

-- Floors: Diamond has two legacy floors with kat_no 1 (3 and 2).
INSERT INTO katlar (id, otel_id, kat_adi, kat_no, aktif) VALUES
  (1, 1, 'Zemin', 0, true),
  (2, 1, '1. Kat', 1, true),
  (3, 1, '1. Kat B Blok', 1, true),
  (4, 4, 'Zemin', 0, true),
  (5, 4, '1. Kat', 1, true),
  (6, 3, '1. Kat', 1, true);

-- Global room types; 3 is used nowhere.
INSERT INTO oda_tipleri (id, ad, aktif, dolap_sayisi) VALUES
  (1, 'STANDART', true, 1),
  (2, 'SUIT', true, 2),
  (3, 'KULLANILMAYAN', true, 1);

-- Rooms: 123456 must stay valid; room 7 has no floor; room 8 repeats Diamond 101; room 5 has a 600 char message.
INSERT INTO odalar (id, kat_id, oda_no, kapasite, aktif, qr_kod_token, qr_kod_olusturma_tarihi, misafir_mesaji, oda_tipi_id) VALUES
  (1, 1, '001', 2, true, '123456', '2026-01-02 10:00:00', 'Hos geldiniz', 1),
  (2, 2, '101', 3, true, 'A1B2C3', NULL, NULL, 1),
  (3, 3, '102', 4, true, '654321', NULL, NULL, 2),
  (4, 4, '001', 2, true, '111111', NULL, NULL, 1),
  (5, 5, '101', 3, true, NULL, NULL, repeat('x', 600), 2),
  (6, 6, '001', 2, true, NULL, NULL, NULL, 2),
  (7, NULL, '999', 2, true, '999999', NULL, NULL, 1),
  (8, 2, '101', 3, true, '888888', NULL, NULL, 1);

-- Product groups: exactly 5 rows (the reader paging test relies on it).
INSERT INTO urun_gruplari (id, grup_adi, aciklama, aktif) VALUES
  (1, 'İçecekler', 'Soğuk içecekler', true),
  (2, 'Atıştırmalık', NULL, true),
  (3, 'Su', NULL, true),
  (4, 'Alkol', NULL, true),
  (5, 'Pasif Grup', NULL, false);

-- Products: 3 repeats Kola's barcode, 2 has a negative price, 6 has no group.
INSERT INTO urunler (id, grup_id, urun_adi, barkod, birim, kritik_stok_seviyesi, aktif, urun_kodu, satis_fiyati, alis_fiyati) VALUES
  (1, 1, 'Kola', '8690001', 'Adet', 10, true, 'K1', 12.5, 8),
  (2, 1, 'Fanta', '8690002', 'Adet', NULL, true, 'K2', -3, 5.25),
  (3, 3, 'Su 0.5', '8690001', NULL, 20, true, NULL, 2, 1),
  (4, 2, 'Çikolata', NULL, 'Adet', 5, true, 'K4', 6, 3),
  (5, 4, 'Bira', '8690005', 'Adet', 8, false, NULL, 15, 9),
  (6, 99, 'Grupsuz Ürün', NULL, 'Adet', 5, true, NULL, 1, 1);

INSERT INTO setuplar (id, ad, aciklama, aktif, dolap_ici) VALUES
  (1, 'Standart Setup', 'Standart dolap', true, true),
  (2, 'Suit Setup', NULL, true, false),
  (3, 'Boş Setup', NULL, false, NULL);

-- Setup contents: (1, urun 1) three times, adet 0, orphan product 999, orphan setup 99.
INSERT INTO setup_icerik (id, setup_id, urun_id, adet) VALUES
  (1, 1, 1, 2),
  (2, 1, 1, 3),
  (3, 1, 1, 1),
  (4, 1, 2, 1),
  (5, 2, 3, 0),
  (6, 1, 999, 1),
  (7, 99, 1, 1),
  (8, 2, 4, 4);

-- Assignments: orphan (type 77 does not exist).
INSERT INTO oda_tipi_setup (otel_id, oda_tipi_id, setup_id) VALUES
  (1, 1, 1),
  (1, 2, 2),
  (4, 1, 1),
  (4, 2, 2),
  (3, 2, 2),
  (4, 77, 1);

-- ====================================================================================================
-- Task 13: users, e-mail, stock requests, notifications, MyBar, transactions, checks, pool.
-- Naive timestamps are Nicosia wall-clock time (as written by the legacy Flask application).
-- ====================================================================================================

CREATE TABLE kullanicilar (
  id integer NOT NULL, kullanici_adi varchar NOT NULL, sifre_hash varchar NOT NULL, ad varchar NOT NULL,
  soyad varchar NOT NULL, email varchar, telefon varchar, rol varchar NOT NULL, aktif boolean,
  olusturma_tarihi timestamp, son_giris timestamp, otel_id integer, depo_sorumlusu_id integer,
  tema_renk_1 varchar, tema_renk_2 varchar, email_bildirim_aktif boolean
);
CREATE TABLE kullanici_otel (
  id integer NOT NULL, kullanici_id integer NOT NULL, otel_id integer NOT NULL, olusturma_tarihi timestamp
);
CREATE TABLE email_ayarlari (
  id integer NOT NULL, smtp_server varchar NOT NULL, smtp_port integer NOT NULL, smtp_username varchar NOT NULL,
  smtp_password varchar NOT NULL, smtp_use_tls boolean, smtp_use_ssl boolean, sender_email varchar NOT NULL,
  sender_name varchar, aktif boolean, olusturma_tarihi timestamptz, guncelleme_tarihi timestamptz, guncelleyen_id integer
);
CREATE TABLE email_loglari (
  id integer NOT NULL, alici_email varchar NOT NULL, alici_kullanici_id integer, konu varchar NOT NULL,
  icerik text NOT NULL, email_tipi varchar NOT NULL, durum varchar, hata_mesaji text, gonderim_tarihi timestamptz,
  okundu boolean, okunma_tarihi timestamptz, tracking_id varchar, ilgili_tablo varchar, ilgili_kayit_id integer,
  ek_bilgiler jsonb
);
CREATE TABLE kat_sorumlusu_siparis_talepleri (
  id integer NOT NULL, talep_no varchar NOT NULL, kat_sorumlusu_id integer NOT NULL, depo_sorumlusu_id integer,
  talep_tarihi timestamptz NOT NULL, onay_tarihi timestamptz, teslim_tarihi timestamptz, durum varchar NOT NULL,
  aciklama text, red_nedeni text, olusturma_tarihi timestamptz NOT NULL, guncelleme_tarihi timestamptz
);
CREATE TABLE kat_sorumlusu_siparis_talep_detaylari (
  id integer NOT NULL, talep_id integer NOT NULL, urun_id integer NOT NULL, talep_miktari integer NOT NULL,
  onaylanan_miktar integer NOT NULL, teslim_edilen_miktar integer NOT NULL, aciliyet varchar NOT NULL,
  olusturma_tarihi timestamptz NOT NULL
);
CREATE TABLE bildirimler (
  id integer NOT NULL, hedef_rol varchar NOT NULL, hedef_otel_id integer, hedef_kullanici_id integer,
  bildirim_tipi varchar NOT NULL, baslik varchar NOT NULL, mesaj text, okundu boolean, olusturma_tarihi timestamptz,
  oda_id integer, gorev_id integer, gonderen_id integer
);
CREATE TABLE minibar_dolum_talepleri (
  id integer NOT NULL, oda_id integer NOT NULL, talep_tarihi timestamp NOT NULL, durum varchar NOT NULL,
  tamamlanma_tarihi timestamp, notlar text, tamamlayan_id integer, goren_id integer, gorulme_tarihi timestamptz,
  kapatma_aciklamasi text, iptal_aciklamasi text, iptal_eden_id integer, iptal_tarihi timestamptz
);
CREATE TABLE minibar_dolum_talebi_detay (
  id integer NOT NULL, talep_id integer NOT NULL, urun_id integer NOT NULL, olusturma_tarihi timestamptz
);
CREATE TABLE minibar_islemleri (
  id integer NOT NULL, oda_id integer NOT NULL, personel_id integer NOT NULL, islem_tipi varchar NOT NULL,
  islem_tarihi timestamp, aciklama text
);
CREATE TABLE minibar_islem_detay (
  id integer NOT NULL, islem_id integer NOT NULL, urun_id integer NOT NULL, baslangic_stok integer, bitis_stok integer,
  tuketim integer, eklenen_miktar integer, zimmet_detay_id integer, ekstra_miktar integer, satis_fiyati numeric,
  alis_fiyati numeric, kar_tutari numeric, kar_orani numeric, bedelsiz boolean, kampanya_id integer, setup_miktari integer
);
CREATE TABLE oda_kontrol_kayitlari (
  id integer NOT NULL, oda_id integer NOT NULL, personel_id integer NOT NULL, kontrol_tarihi date NOT NULL,
  baslangic_zamani timestamptz NOT NULL, bitis_zamani timestamptz, kontrol_tipi varchar NOT NULL,
  olusturma_tarihi timestamptz NOT NULL
);
CREATE TABLE otel_zimmet_stok (
  id integer NOT NULL, otel_id integer NOT NULL, urun_id integer NOT NULL, toplam_miktar integer NOT NULL,
  kullanilan_miktar integer NOT NULL, kalan_miktar integer NOT NULL, kritik_stok_seviyesi integer,
  son_guncelleme timestamptz, olusturma_tarihi timestamptz
);
CREATE TABLE personel_zimmet (
  id integer NOT NULL, personel_id integer NOT NULL, zimmet_tarihi timestamp, iade_tarihi timestamp,
  teslim_eden_id integer, durum varchar, aciklama text, otel_id integer
);
CREATE TABLE personel_zimmet_detay (
  id integer NOT NULL, zimmet_id integer NOT NULL, urun_id integer NOT NULL, miktar integer NOT NULL,
  kullanilan_miktar integer, kalan_miktar integer, iade_edilen_miktar integer, kritik_stok_seviyesi integer
);
CREATE TABLE personel_zimmet_kullanim (
  id integer NOT NULL, otel_zimmet_stok_id integer NOT NULL, personel_id integer NOT NULL, urun_id integer NOT NULL,
  kullanilan_miktar integer NOT NULL, islem_tarihi timestamptz, islem_tipi varchar, referans_islem_id integer,
  aciklama text, olusturan_id integer
);
CREATE TABLE zimmet_sablonlari (
  id integer NOT NULL, sablon_adi varchar NOT NULL, aciklama text, olusturan_id integer, otel_id integer,
  aktif boolean, olusturma_tarihi timestamptz, guncelleme_tarihi timestamptz
);
CREATE TABLE zimmet_sablon_detaylari (
  id integer NOT NULL, sablon_id integer NOT NULL, urun_id integer NOT NULL, varsayilan_miktar integer NOT NULL
);

-- Users. 1 and 5 carry a Werkzeug pbkdf2 hash of Test!2026; 7 an scrypt hash; 9 a bcrypt hash; 8 has an unknown role.
INSERT INTO kullanicilar (id, kullanici_adi, sifre_hash, ad, soyad, email, telefon, rol, aktif, olusturma_tarihi, son_giris, otel_id, depo_sorumlusu_id) VALUES
  (1, 'sistem1', 'pbkdf2:sha256:1000$saltsalt$e33e9a4ac07570a2b72109c47ffd916ef20b11a3520b8ef50f70a01a85519a82', 'Sistem', 'Yonetici', 'sistem@example.test', '555', 'sistem_yoneticisi', true, '2026-01-01 09:00:00', '2026-10-30 08:00:00', NULL, NULL),
  (2, 'admin', 'pbkdf2:sha256:1000$saltsalt$e33e9a4ac07570a2b72109c47ffd916ef20b11a3520b8ef50f70a01a85519a82', 'Otel', 'Mudur', NULL, NULL, 'admin', true, '2026-01-02 09:00:00', NULL, NULL, NULL),
  (3, 'depo_cok', 'pbkdf2:sha256:1000$saltsalt$e33e9a4ac07570a2b72109c47ffd916ef20b11a3520b8ef50f70a01a85519a82', 'Depo', 'Cok', NULL, NULL, 'depo_sorumlusu', true, '2026-01-03 09:00:00', NULL, NULL, NULL),
  (4, 'depo_diamond', 'pbkdf2:sha256:1000$saltsalt$e33e9a4ac07570a2b72109c47ffd916ef20b11a3520b8ef50f70a01a85519a82', 'Depo', 'Diamond', NULL, NULL, 'depo_sorumlusu', true, '2026-01-04 09:00:00', NULL, NULL, NULL),
  (5, 'kat_diamond', 'pbkdf2:sha256:1000$saltsalt$e33e9a4ac07570a2b72109c47ffd916ef20b11a3520b8ef50f70a01a85519a82', 'Kat', 'Diamond', NULL, NULL, 'kat_sorumlusu', true, '2026-01-05 09:00:00', NULL, 1, 3),
  (6, 'superadmin', 'pbkdf2:sha256:1000$saltsalt$e33e9a4ac07570a2b72109c47ffd916ef20b11a3520b8ef50f70a01a85519a82', 'Super', 'Admin', NULL, NULL, 'superadmin', true, '2026-01-06 09:00:00', NULL, NULL, NULL),
  (7, 'kat_eski', 'scrypt:32768:8:1$scryptsalt$00112233445566778899aabbccddeeff', 'Kat', 'Eski', NULL, NULL, 'kat_sorumlusu', true, '2026-01-07 09:00:00', NULL, 4, 3),
  (8, 'muhasebe1', 'pbkdf2:sha256:1000$saltsalt$e33e9a4ac07570a2b72109c47ffd916ef20b11a3520b8ef50f70a01a85519a82', 'Muhasebe', 'Bir', NULL, NULL, 'muhasebe', true, '2026-01-08 09:00:00', NULL, NULL, NULL),
  (9, 'kat_royal', '$2b$04$ZMRBlNEtnJ7dkDBLZvr36eRhlFReqWMtWjWWYL7ANTh092EgLpeDK', 'Kat', 'Royal', NULL, NULL, 'kat_sorumlusu', true, '2026-01-09 09:00:00', NULL, 4, 3),
  (10, 'kat_otelsiz', 'pbkdf2:sha256:1000$saltsalt$e33e9a4ac07570a2b72109c47ffd916ef20b11a3520b8ef50f70a01a85519a82', 'Kat', 'Otelsiz', NULL, NULL, 'kat_sorumlusu', false, '2026-01-10 09:00:00', NULL, NULL, 99);

INSERT INTO kullanici_otel (id, kullanici_id, otel_id, olusturma_tarihi) VALUES
  (1, 3, 1, '2026-01-03 09:00:00'),
  (2, 3, 3, '2026-01-03 09:00:00'),
  (3, 4, 1, '2026-01-04 09:00:00'),
  (4, 99, 1, '2026-01-04 09:00:00');

-- E-mail settings: the highest id wins. The SMTP password is a made-up marker that must never reach the target.
INSERT INTO email_ayarlari (id, smtp_server, smtp_port, smtp_username, smtp_password, smtp_use_tls, smtp_use_ssl, sender_email, sender_name, aktif) VALUES
  (1, 'old.smtp.test', 25, 'eski', 'ESKI-PAROLA', false, false, 'eski@example.test', 'Eski', true),
  (2, 'smtp.example.test', 587, 'mailer', 'GIZLI-SMTP-PAROLASI', true, false, 'noreply@example.test', 'Merit', true);

INSERT INTO email_loglari (id, alici_email, alici_kullanici_id, konu, icerik, email_tipi, durum, hata_mesaji, gonderim_tarihi, tracking_id, ilgili_tablo, ilgili_kayit_id) VALUES
  (1, 'a@example.test', 5, 'Konu 1', 'govde', 'rapor', 'gonderildi', NULL, '2026-10-01 10:00:00+03', 'trk-1', 'minibar_islemleri', 3),
  (2, 'b@example.test', 99, 'Konu 2', 'govde', 'uyari', 'hata', 'SMTP hata', '2026-10-02 10:00:00+03', NULL, NULL, NULL),
  (3, 'c@example.test', NULL, 'Konu 3', 'govde', 'sistem', 'bekliyor', NULL, '2026-10-03 10:00:00+03', 'trk-1', NULL, NULL),
  (4, 'd@example.test', 3, 'Konu 4', 'govde', 'sistem', NULL, NULL, '2026-10-04 10:00:00+03', 'trk-4', NULL, NULL);

-- Stock requests: 1 pending (urgent item + missing product + zero qty), 2 delivered by an unknown-role user,
-- 3 repeats the request number, 4 approved, 5 from a user without a hotel, 6 has an unknown status.
INSERT INTO kat_sorumlusu_siparis_talepleri (id, talep_no, kat_sorumlusu_id, depo_sorumlusu_id, talep_tarihi, onay_tarihi, teslim_tarihi, durum, aciklama, red_nedeni, olusturma_tarihi) VALUES
  (1, 'KST-1', 5, NULL, '2026-10-10 09:00:00+03', NULL, NULL, 'beklemede', 'acil lazim', NULL, '2026-10-10 09:00:00+03'),
  (2, 'KST-2', 5, 8, '2026-10-11 09:00:00+03', '2026-10-11 10:00:00+03', '2026-10-11 12:00:00+03', 'teslim_edildi', NULL, NULL, '2026-10-11 09:00:00+03'),
  (3, 'KST-1', 9, 3, '2026-10-12 09:00:00+03', NULL, NULL, 'reddedildi', NULL, 'stok yok', '2026-10-12 09:00:00+03'),
  (4, 'KST-4', 5, 3, '2026-10-13 09:00:00+03', '2026-10-13 10:00:00+03', NULL, 'onaylandi', NULL, NULL, '2026-10-13 09:00:00+03'),
  (5, 'KST-5', 10, NULL, '2026-10-14 09:00:00+03', NULL, NULL, 'beklemede', NULL, NULL, '2026-10-14 09:00:00+03'),
  (6, 'KST-6', 5, NULL, '2026-10-15 09:00:00+03', NULL, NULL, 'garip', NULL, NULL, '2026-10-15 09:00:00+03');
INSERT INTO kat_sorumlusu_siparis_talep_detaylari (id, talep_id, urun_id, talep_miktari, onaylanan_miktar, teslim_edilen_miktar, aciliyet, olusturma_tarihi) VALUES
  (1, 1, 1, 10, 0, 0, 'acil', '2026-10-10 09:00:00+03'),
  (2, 1, 999, 5, 0, 0, 'normal', '2026-10-10 09:00:00+03'),
  (3, 1, 4, 0, 0, 0, 'normal', '2026-10-10 09:00:00+03'),
  (4, 2, 1, 20, 20, 18, 'normal', '2026-10-11 09:00:00+03'),
  (5, 3, 1, 5, 0, 0, 'normal', '2026-10-12 09:00:00+03'),
  (6, 4, 4, 8, 6, 0, 'normal', '2026-10-13 09:00:00+03');

-- Notifications. 1: all depo users of Premium (3) -> only depo_cok. 2: single user. 3: 31 days old. 4: role-wide, room ref.
-- 5: kat role of Royal (4). 6: system managers, task ref. 7: admin role with a recipient (the migrated admin, all hotels).
INSERT INTO bildirimler (id, hedef_rol, hedef_otel_id, hedef_kullanici_id, bildirim_tipi, baslik, mesaj, okundu, olusturma_tarihi, oda_id, gorev_id) VALUES
  (1, 'depo_sorumlusu', 3, NULL, 'stok', 'Depo uyarisi', 'mesaj 1', true, now() - interval '2 days', NULL, NULL),
  (2, 'kat_sorumlusu', 1, 5, 'gorev', 'Tek kullanici', NULL, false, now() - interval '3 days', NULL, 77),
  (3, 'depo_sorumlusu', 1, NULL, 'stok', 'Eski', 'eski', false, now() - interval '31 days', NULL, NULL),
  (4, 'depo_sorumlusu', NULL, NULL, 'dnd', 'Her depo', 'oda', false, now() - interval '1 day', 2, NULL),
  (5, 'kat_sorumlusu', 4, NULL, 'gorev', 'Royal kat', 'x', false, now() - interval '1 day', NULL, NULL),
  (6, 'sistem_yoneticisi', NULL, NULL, 'sistem', 'Sistem', 'y', false, now() - interval '1 day', NULL, 5),
  (7, 'muhasebe', 1, NULL, 'sistem', 'Bilinmeyen rol', 'z', false, now() - interval '1 day', NULL, NULL);

-- MyBar requests. 1 completed (Nicosia 10:00-10:05, staff 5, closed with a note), 2 cancelled, 3 legacy 'onaylandi',
-- 4 pending, 7 pending right after Nicosia midnight (2026-10-30T22:30:00Z), 8 just before midnight, 9 in an unmigrated room,
-- 10 with an unknown status.
INSERT INTO minibar_dolum_talepleri (id, oda_id, talep_tarihi, durum, tamamlanma_tarihi, notlar, tamamlayan_id, goren_id, gorulme_tarihi, kapatma_aciklamasi, iptal_aciklamasi, iptal_eden_id, iptal_tarihi) VALUES
  (1, 2, '2026-10-20 10:00:00', 'tamamlandi', '2026-10-20 10:05:00', 'misafir notu', 5, 5, '2026-10-20 10:01:00+03', 'eksik urun var', NULL, NULL, NULL),
  (2, 2, '2026-10-21 10:00:00', 'iptal', NULL, NULL, NULL, NULL, NULL, NULL, 'vazgecti', 5, '2026-10-21 11:00:00+03'),
  (3, 1, '2026-10-22 10:00:00', 'onaylandi', '2026-10-22 10:30:00', NULL, 5, NULL, NULL, NULL, NULL, NULL, NULL),
  (4, 1, '2026-10-23 10:00:00', 'beklemede', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (7, 3, '2026-10-31 00:30:00', 'beklemede', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (8, 3, '2026-10-30 23:59:00', 'beklemede', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (9, 8, '2026-10-24 10:00:00', 'beklemede', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (10, 1, '2026-10-25 10:00:00', 'garip', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO minibar_dolum_talebi_detay (id, talep_id, urun_id, olusturma_tarihi) VALUES
  (1, 1, 1, '2026-10-20 10:00:00+03'),
  (2, 1, 4, '2026-10-20 10:00:00+03'),
  (3, 1, 999, '2026-10-20 10:00:00+03'),
  (4, 3, 1, '2026-10-22 10:00:00+03'),
  (5, 4, 1, '2026-10-23 10:00:00+03');

-- Minibar transactions. 3 (10:12) is inside MyBar 1's window (10:05 + 10 min), 4 (10:30) is outside; 6 is in an unmigrated room.
INSERT INTO minibar_islemleri (id, oda_id, personel_id, islem_tipi, islem_tarihi, aciklama) VALUES
  (1, 1, 5, 'setup_kontrol', '2026-10-20 09:00:00', 'kontrol'),
  (2, 1, 5, 'sarfiyat_yok', '2026-10-20 09:30:00', NULL),
  (3, 2, 5, 'ekstra_ekleme', '2026-10-20 10:12:00', 'mybar karsilandi'),
  (4, 2, 5, 'ekstra_ekleme', '2026-10-20 10:30:00', NULL),
  (5, 1, 8, 'setup_disi_ekleme', '2026-10-20 11:00:00', NULL),
  (6, 8, 5, 'setup_kontrol', '2026-10-20 12:00:00', NULL),
  (7, 3, 5, 'ilk_dolum', '2026-10-20 13:00:00', NULL);
INSERT INTO minibar_islem_detay (id, islem_id, urun_id, baslangic_stok, bitis_stok, tuketim, eklenen_miktar, zimmet_detay_id, ekstra_miktar, satis_fiyati, alis_fiyati, kar_tutari, kar_orani, bedelsiz, setup_miktari) VALUES
  (1, 1, 1, 3, 2, 1, 1, 5, 3, 12.5, 8, 4.5, 56, false, 2),
  (2, 1, 4, 4, 4, 0, 0, NULL, 0, 6, 3, 3, 100, true, 4),
  (3, 1, 999, 1, 1, 0, 0, NULL, 0, 1, 1, 0, 0, false, 1),
  (4, 3, 1, 2, 4, 0, 2, NULL, 0, 12.5, 8, NULL, NULL, false, 2),
  (5, 4, 4, 1, 2, 0, 1, NULL, NULL, -5, 3, NULL, NULL, NULL, 4),
  (6, 5, 1, 0, 1, 0, 1, NULL, 1, 12.5, 8, NULL, NULL, false, 0),
  (7, 6, 1, 1, 1, 0, 0, NULL, 0, 1, 1, NULL, NULL, false, 1),
  (8, 7, 1, 0, 2, 0, 2, NULL, 0, 12.5, 8, NULL, NULL, false, 2),
  (9, 99, 1, 0, 0, 0, 0, NULL, 0, 1, 1, NULL, NULL, false, 0);

INSERT INTO oda_kontrol_kayitlari (id, oda_id, personel_id, kontrol_tarihi, baslangic_zamani, bitis_zamani, kontrol_tipi, olusturma_tarihi) VALUES
  (1, 1, 5, '2026-10-20', '2026-10-20 09:00:00+03', '2026-10-20 09:05:00+03', 'urun_eklendi', '2026-10-20 09:00:00+03'),
  (2, 1, 5, '2026-10-20', '2026-10-20 09:30:00+03', '2026-10-20 09:31:00+03', 'sarfiyat_yok', '2026-10-20 09:30:00+03'),
  (3, 2, 5, '2026-10-20', '2026-10-20 09:40:00+03', NULL, 'dnd', '2026-10-20 09:40:00+03'),
  (4, 2, 8, '2026-10-20', '2026-10-20 09:50:00+03', NULL, 'garip', '2026-10-20 09:50:00+03'),
  (5, 8, 5, '2026-10-20', '2026-10-20 09:55:00+03', NULL, 'dnd', '2026-10-20 09:55:00+03');

-- Pool rows. 1: total 100 / used 30 / remaining 60 (inconsistent) with no critical level; 3: negative remaining;
-- 5 and 6 point at an unmigrated product / hotel.
INSERT INTO otel_zimmet_stok (id, otel_id, urun_id, toplam_miktar, kullanilan_miktar, kalan_miktar, kritik_stok_seviyesi, son_guncelleme, olusturma_tarihi) VALUES
  (1, 1, 1, 100, 30, 60, NULL, '2026-10-20 12:00:00+03', '2026-09-01 08:00:00+03'),
  (2, 1, 4, 50, 10, 40, 5, '2026-10-20 12:00:00+03', '2026-09-02 08:00:00+03'),
  (3, 3, 1, 10, 5, -3, 7, '2026-10-20 12:00:00+03', '2026-09-03 08:00:00+03'),
  (4, 4, 1, 20, 5, 15, 3, '2026-10-20 12:00:00+03', '2026-09-04 08:00:00+03'),
  (5, 1, 999, 5, 0, 5, 1, NULL, '2026-09-05 08:00:00+03'),
  (6, 77, 1, 5, 0, 5, 1, NULL, '2026-09-06 08:00:00+03');

INSERT INTO personel_zimmet_kullanim (id, otel_zimmet_stok_id, personel_id, urun_id, kullanilan_miktar, islem_tarihi, islem_tipi, referans_islem_id, aciklama, olusturan_id) VALUES
  (1, 1, 5, 1, 5, '2026-10-20 09:00:00+03', 'minibar_kullanim', NULL, 'normal kullanim', 5),
  (2, 1, 5, 1, 3, '2026-10-20 10:12:00+03', 'minibar_kullanim', 3, 'mybar', 5),
  (3, 1, 5, 1, 2, '2026-10-20 11:00:00+03', 'iade', 1, 'yanlis girildi', 5),
  (4, 1, 5, 1, 1, '2026-10-20 11:30:00+03', 'duzeltme', NULL, 'sayim', 5),
  (5, 2, 8, 4, 4, '2026-10-20 12:00:00+03', 'minibar_kullanim', 99999, NULL, 8),
  (6, 999, 5, 1, 1, '2026-10-20 12:30:00+03', 'minibar_kullanim', NULL, NULL, 5),
  (7, 5, 5, 1, 1, '2026-10-20 12:31:00+03', 'minibar_kullanim', NULL, NULL, 5),
  (8, 4, 5, 1, 1, '2026-10-20 12:32:00+03', 'bilinmez', NULL, NULL, 5);

INSERT INTO personel_zimmet (id, personel_id, zimmet_tarihi, iade_tarihi, teslim_eden_id, durum, aciklama, otel_id) VALUES
  (1, 5, '2026-09-01 08:00:00', NULL, 3, 'aktif', 'eski zimmet', 1),
  (2, 7, '2026-09-02 08:00:00', '2026-09-30 08:00:00', 3, 'iade', NULL, 4);
INSERT INTO personel_zimmet_detay (id, zimmet_id, urun_id, miktar, kullanilan_miktar, kalan_miktar, iade_edilen_miktar, kritik_stok_seviyesi) VALUES
  (1, 1, 1, 10, 4, 6, 0, 2),
  (2, 1, 4, 5, 1, 4, 0, 1),
  (3, 2, 1, 3, 3, 0, 0, 1);
INSERT INTO zimmet_sablonlari (id, sablon_adi, aciklama, olusturan_id, otel_id, aktif, olusturma_tarihi) VALUES
  (1, 'Standart sablon', NULL, 3, 1, true, '2026-08-01 08:00:00+03');
INSERT INTO zimmet_sablon_detaylari (id, sablon_id, urun_id, varsayilan_miktar) VALUES
  (1, 1, 1, 10),
  (2, 1, 4, 5);

-- ============================================================ Task 14: occupancy, tasks, DND, logs
CREATE TABLE dosya_yuklemeleri (
  id integer NOT NULL, islem_kodu varchar NOT NULL, dosya_adi varchar, dosya_tipi varchar NOT NULL, durum varchar,
  toplam_satir integer, basarili_satir integer, hatali_satir integer, hata_detaylari text, yukleme_tarihi timestamp,
  yukleyen_id integer, otel_id integer NOT NULL, dosya_yolu varchar, dosya_boyutu integer, silme_tarihi timestamp,
  yuklenen_kullanici_id integer
);
CREATE TABLE misafir_kayitlari (
  id integer NOT NULL, oda_id integer NOT NULL, islem_kodu varchar NOT NULL, misafir_sayisi integer,
  giris_tarihi date NOT NULL, giris_saati time, cikis_tarihi date NOT NULL, cikis_saati time, kayit_tipi varchar NOT NULL,
  olusturma_tarihi timestamp, olusturan_id integer, dosya_yukleme_id integer, kaynak varchar, durum varchar,
  otel_id integer, guncelleme_tarihi timestamp
);
CREATE TABLE yukleme_gorevleri (
  id integer NOT NULL, otel_id integer NOT NULL, depo_sorumlusu_id integer, gorev_tarihi date NOT NULL,
  dosya_tipi varchar NOT NULL, durum varchar, yukleme_zamani timestamptz, dosya_yukleme_id integer,
  olusturma_tarihi timestamptz
);
CREATE TABLE gunluk_gorevler (
  id integer NOT NULL, otel_id integer NOT NULL, personel_id integer, gorev_tarihi date NOT NULL, gorev_tipi varchar,
  durum varchar, olusturma_tarihi timestamptz, tamamlanma_tarihi timestamptz, notlar text
);
CREATE TABLE gorev_detaylari (
  id integer NOT NULL, gorev_id integer NOT NULL, oda_id integer NOT NULL, misafir_kayit_id integer, durum varchar,
  varis_saati time, cikis_saati time, oncelik_sirasi integer, kontrol_zamani timestamptz, dnd_sayisi integer,
  son_dnd_zamani timestamptz, notlar text
);
CREATE TABLE gorev_durum_loglari (
  id integer NOT NULL, gorev_detay_id integer NOT NULL, onceki_durum varchar, yeni_durum varchar,
  degisiklik_zamani timestamptz, degistiren_id integer, aciklama text
);
CREATE TABLE oda_dnd_kayitlari (
  id integer NOT NULL, oda_id integer NOT NULL, otel_id integer, kayit_tarihi date NOT NULL, dnd_sayisi integer,
  ilk_dnd_zamani timestamp, son_dnd_zamani timestamp, durum varchar, gorev_detay_id integer,
  olusturma_tarihi timestamp, guncelleme_tarihi timestamp
);
CREATE TABLE oda_dnd_kontrolleri (
  id integer NOT NULL, dnd_kayit_id integer NOT NULL, kontrol_no integer, kontrol_eden_id integer,
  kontrol_zamani timestamp NOT NULL, notlar text
);
CREATE TABLE dnd_kontroller (
  id integer NOT NULL, gorev_detay_id integer NOT NULL, kontrol_zamani timestamptz NOT NULL, kontrol_eden_id integer,
  notlar text
);
CREATE TABLE qr_kod_okutma_loglari (
  id integer NOT NULL, oda_id integer, kullanici_id integer, okutma_tarihi timestamp NOT NULL, okutma_tipi varchar NOT NULL,
  ip_adresi varchar, user_agent varchar, basarili boolean, hata_mesaji text
);
CREATE TABLE audit_logs (
  id integer NOT NULL, kullanici_id integer, kullanici_adi varchar, kullanici_rol varchar, islem_tipi varchar,
  tablo_adi varchar, kayit_id integer, eski_deger jsonb, yeni_deger jsonb, ip_adresi varchar, user_agent varchar,
  islem_tarihi timestamp NOT NULL
);
CREATE TABLE sistem_loglari (
  id integer NOT NULL, kullanici_id integer, islem_tipi varchar, modul varchar, islem_detay jsonb, ip_adresi varchar,
  tarayici varchar, islem_tarihi timestamp NOT NULL
);

-- Uploads. 2 is deleted and has a file path that must never be copied; 3 has a non-JSON error text and no uploader;
-- 4 has an unknown file type; 5 belongs to an unmigrated hotel.
INSERT INTO dosya_yuklemeleri (id, islem_kodu, dosya_adi, dosya_tipi, durum, toplam_satir, basarili_satir, hatali_satir, hata_detaylari, yukleme_tarihi, yukleyen_id, otel_id, dosya_yolu, dosya_boyutu, silme_tarihi, yuklenen_kullanici_id) VALUES
  (1, 'U-IN-1', 'inhouse.xlsx', 'in_house', 'tamamlandi', 100, 98, 2, '[{"row":5,"message":"oda yok"}]', '2026-10-20 08:00:00', NULL, 1, '/srv/secret/inhouse.xlsx', 1000, NULL, 5),
  (2, 'U-AR-1', 'arrivals.xlsx', 'arrivals', 'silindi', 10, 10, 0, NULL, '2026-10-20 08:10:00', 4, 1, '/srv/secret/arrivals.xlsx', 500, '2026-10-24 08:10:00', NULL),
  (3, 'U-DE-1', 'departures.xlsx', 'departures', 'hata', 5, 0, 5, 'dosya bozuk', '2026-10-20 08:20:00', NULL, 4, NULL, NULL, NULL, NULL),
  (4, 'U-X-1', 'x.xlsx', 'weird', 'tamamlandi', 1, 1, 0, NULL, '2026-10-20 08:30:00', NULL, 3, NULL, NULL, NULL, NULL),
  (5, 'U-IN-2', 'y.xlsx', 'inhouse', 'tamamlandi', 1, 1, 0, NULL, '2026-10-20 08:40:00', NULL, 99, NULL, NULL, NULL, NULL);

-- Guest records. 4 has no upload; 5 belongs to an unmigrated room; 6 has an unknown kind.
INSERT INTO misafir_kayitlari (id, oda_id, islem_kodu, misafir_sayisi, giris_tarihi, giris_saati, cikis_tarihi, cikis_saati, kayit_tipi, olusturma_tarihi, olusturan_id, dosya_yukleme_id, kaynak, durum, otel_id, guncelleme_tarihi) VALUES
  (1, 1, 'U-IN-1', 2, '2026-10-18', '14:30:00', '2026-10-22', '11:00:00', 'in_house', '2026-10-20 08:00:00', 5, 1, 'excel', 'aktif', 1, NULL),
  (2, 2, 'U-IN-1', 3, '2026-10-19', NULL, '2026-10-23', NULL, 'in_house', '2026-10-20 08:00:00', 5, 1, 'excel', 'aktif', 1, NULL),
  (3, 3, 'U-AR-1', 2, '2026-10-20', '15:00:00', '2026-10-25', '10:00:00', 'arrival', '2026-10-20 08:10:00', 4, 2, 'excel', 'aktif', 1, NULL),
  (4, 4, 'ELLE-1', 1, '2026-10-15', '12:00:00', '2026-10-20', '09:30:00', 'departure', '2026-10-20 08:20:00', NULL, NULL, 'excel', 'aktif', 4, NULL),
  (5, 99, 'U-IN-1', 1, '2026-10-20', NULL, '2026-10-21', NULL, 'in_house', '2026-10-20 08:00:00', NULL, 1, 'excel', 'aktif', 1, NULL),
  (6, 5, 'U-IN-1', 1, '2026-10-20', NULL, '2026-10-21', NULL, 'garip', '2026-10-20 08:00:00', NULL, 1, 'excel', 'aktif', 4, NULL);

-- Upload tasks. 1 and 3 collide on (hotel 1, 2026-10-20, IN_HOUSE): the newer one (3) wins. 5 has an unknown type.
INSERT INTO yukleme_gorevleri (id, otel_id, depo_sorumlusu_id, gorev_tarihi, dosya_tipi, durum, yukleme_zamani, dosya_yukleme_id, olusturma_tarihi) VALUES
  (1, 1, 4, '2026-10-20', 'inhouse', 'completed', '2026-10-20 08:00:00+03', 1, '2026-10-20 07:00:00+03'),
  (2, 1, 4, '2026-10-20', 'arrivals', 'pending', NULL, NULL, '2026-10-20 07:00:00+03'),
  (3, 1, 4, '2026-10-20', 'in_house', 'incomplete', NULL, NULL, '2026-10-20 09:00:00+03'),
  (4, 4, 4, '2026-10-20', 'departures', 'in_progress', NULL, 3, '2026-10-20 07:00:00+03'),
  (5, 3, 4, '2026-10-20', 'zzz', 'pending', NULL, NULL, '2026-10-20 07:00:00+03');

-- Daily tasks: 4 has a non-control type, so details without a guest record fall back to INHOUSE_KONTROL.
INSERT INTO gunluk_gorevler (id, otel_id, personel_id, gorev_tarihi, gorev_tipi, durum, olusturma_tarihi, tamamlanma_tarihi, notlar) VALUES
  (1, 1, 5, '2026-10-20', 'inhouse_kontrol', 'completed', '2026-10-20 06:00:00+03', '2026-10-20 15:00:00+03', NULL),
  (2, 1, 5, '2026-10-20', 'arrival_kontrol', 'in_progress', '2026-10-20 06:00:00+03', NULL, NULL),
  (3, 4, 9, '2026-10-20', 'departure_kontrol', 'dnd_pending', '2026-10-20 06:00:00+03', NULL, NULL),
  (4, 1, 5, '2026-10-21', 'inhouse_yukleme', 'incomplete', '2026-10-21 06:00:00+03', NULL, NULL);

-- Details. 1,2: in_house group (completed); 6 duplicates room 1 of the same group; 3,10,11: arrival group;
-- 4: departure group with task-linked DND; 5: no guest record, non-control parent type; 7: unmigrated room; 8: no parent.
INSERT INTO gorev_detaylari (id, gorev_id, oda_id, misafir_kayit_id, durum, varis_saati, cikis_saati, oncelik_sirasi, kontrol_zamani, dnd_sayisi, son_dnd_zamani, notlar) VALUES
  (1, 1, 1, 1, 'completed', '14:30:00', '11:00:00', 1, '2026-10-20 10:00:00+03', 0, NULL, 'ilk'),
  (2, 1, 2, 2, 'completed', NULL, NULL, 2, '2026-10-20 11:30:00+03', 0, NULL, NULL),
  (3, 2, 3, 3, 'in_progress', '15:00:00', '10:00:00', 3, NULL, 0, NULL, NULL),
  (4, 3, 4, 4, 'dnd_pending', '12:00:00', '09:30:00', 4, NULL, 2, '2026-10-20 18:00:00+03', NULL),
  (5, 4, 1, NULL, 'incomplete', NULL, NULL, 5, NULL, 0, NULL, 'misafir kaydi yok'),
  (6, 1, 1, 1, 'pending', NULL, NULL, 6, NULL, 0, NULL, 'cift'),
  (7, 1, 99, 1, 'pending', NULL, NULL, 7, NULL, 0, NULL, NULL),
  (8, 999, 1, 1, 'pending', NULL, NULL, 8, NULL, 0, NULL, NULL),
  (10, 2, 2, 3, 'pending', NULL, NULL, 10, NULL, 1, '2026-10-20 13:00:00+03', NULL),
  (11, 2, 6, 3, 'garip', NULL, NULL, 11, NULL, 0, NULL, NULL);

INSERT INTO gorev_durum_loglari (id, gorev_detay_id, onceki_durum, yeni_durum, degisiklik_zamani, degistiren_id, aciklama) VALUES
  (1, 1, NULL, 'in_progress', '2026-10-20 09:00:00+03', 5, NULL),
  (2, 1, 'in_progress', 'completed', '2026-10-20 10:00:00+03', 5, 'tamam'),
  (3, 999, 'pending', 'completed', '2026-10-20 10:00:00+03', 5, NULL),
  (4, 3, 'pending', NULL, '2026-10-20 12:00:00+03', 77, 'yeni durum bos'),
  (5, 6, 'pending', 'pending', '2026-10-20 12:30:00+03', 5, 'cift kalemin gunlugu');

-- Independent DND records. 1: two checks; 2: collides with the task-linked DND of detail 10; 3: zero count, no times,
-- 'incomplete'; 4: unmigrated room; 5: unknown status.
INSERT INTO oda_dnd_kayitlari (id, oda_id, otel_id, kayit_tarihi, dnd_sayisi, ilk_dnd_zamani, son_dnd_zamani, durum, gorev_detay_id, olusturma_tarihi, guncelleme_tarihi) VALUES
  (1, 1, 1, '2026-10-20', 2, '2026-10-20 09:00:00', '2026-10-20 12:00:00', 'aktif', NULL, '2026-10-20 09:00:00', NULL),
  (2, 2, 1, '2026-10-20', 1, '2026-10-20 12:30:00', '2026-10-20 12:30:00', 'tamamlandi', 10, '2026-10-20 12:30:00', NULL),
  (3, 3, 1, '2026-10-20', 0, NULL, NULL, 'incomplete', NULL, '2026-10-20 08:00:00', NULL),
  (4, 99, 1, '2026-10-20', 1, '2026-10-20 08:00:00', '2026-10-20 08:00:00', 'aktif', NULL, '2026-10-20 08:00:00', NULL),
  (5, 4, 4, '2026-10-19', 1, '2026-10-19 08:00:00', '2026-10-19 08:00:00', 'garip', NULL, '2026-10-19 08:00:00', NULL);
INSERT INTO oda_dnd_kontrolleri (id, dnd_kayit_id, kontrol_no, kontrol_eden_id, kontrol_zamani, notlar) VALUES
  (1, 1, 1, 5, '2026-10-20 09:00:00', NULL),
  (2, 1, 2, 5, '2026-10-20 12:00:00', 'ikinci'),
  (3, 2, 1, 5, '2026-10-20 12:30:00', NULL),
  (4, 999, 1, 5, '2026-10-20 12:30:00', NULL),
  (5, 5, 1, NULL, '2026-10-19 08:00:00', NULL);
-- Task-linked checks (inserted newest first on purpose). 4 belongs to a detail without a DND count.
INSERT INTO dnd_kontroller (id, gorev_detay_id, kontrol_zamani, kontrol_eden_id, notlar) VALUES
  (1, 4, '2026-10-20 17:00:00+03', 5, 'ikinci'),
  (2, 4, '2026-10-20 16:00:00+03', 5, 'birinci'),
  (3, 10, '2026-10-20 13:00:00+03', 5, NULL),
  (4, 8, '2026-10-20 13:00:00+03', 5, NULL);

INSERT INTO qr_kod_okutma_loglari (id, oda_id, kullanici_id, okutma_tarihi, okutma_tipi, ip_adresi, user_agent, basarili, hata_mesaji) VALUES
  (1, 1, NULL, '2026-10-20 10:00:00', 'misafir_okutma', '1.2.3.4', 'Mozilla', true, NULL),
  (2, 2, 5, '2026-10-20 10:05:00', 'personel_kontrol', NULL, NULL, false, 'gecersiz'),
  (3, 99, NULL, '2026-10-20 10:10:00', 'sistem_kontrol', '5.6.7.8', 'bot', true, NULL),
  (4, 1, NULL, '2026-10-20 10:15:00', 'misafir', '1.2.3.4', 'Mozilla', true, NULL),
  (5, 1, NULL, '2026-10-20 10:20:00', 'garip', '1.2.3.4', 'Mozilla', true, NULL);

INSERT INTO audit_logs (id, kullanici_id, kullanici_adi, kullanici_rol, islem_tipi, tablo_adi, kayit_id, eski_deger, yeni_deger, ip_adresi, user_agent, islem_tarihi) VALUES
  (1, 5, 'kat_diamond', 'kat_sorumlusu', 'update', 'urunler', 5, '{"ad":"a"}', '{"ad":"b"}', '10.0.0.1', 'Mozilla', '2026-10-20 09:00:00'),
  (2, NULL, 'anon', 'yok', 'login', 'kullanicilar', NULL, NULL, NULL, NULL, NULL, '2026-10-20 09:05:00'),
  (3, 77, 'x', 'y', NULL, 'odalar', 3, NULL, '{"k":1}', NULL, NULL, '2026-10-20 09:10:00');
INSERT INTO sistem_loglari (id, kullanici_id, islem_tipi, modul, islem_detay, ip_adresi, tarayici, islem_tarihi) VALUES
  (1, 5, 'giris', 'auth', '{"ok":true}', '10.0.0.1', 'Mozilla', '2026-10-20 09:20:00'),
  (2, NULL, 'hata', 'minibar', NULL, NULL, NULL, '2026-10-20 09:30:00');
