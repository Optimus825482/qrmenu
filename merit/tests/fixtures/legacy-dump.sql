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
