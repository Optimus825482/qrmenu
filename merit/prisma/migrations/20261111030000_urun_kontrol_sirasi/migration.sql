-- Oda kontrolunde urun sirasi (11 Kas 2026, urun sahibi istegi): eski minibar sisteminde kat sorumlulari urunleri
-- oda basinda teker teker kaydediyordu. 47 bin oda ziyaretindeki kayit sirasi ikili karsilastirmayla (A, B'den once
-- kac kez girildi) cikarildi; yeni sistemde oda kontrol listesi ayni sirayi izler. Listede olmayan urun 1000 alir ve
-- sona, ada gore dizilir. Tanimlardan sonradan eklenen urun de 1000 ile baslar.
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "sort_order" INTEGER NOT NULL DEFAULT 1000;

UPDATE "products" p
SET "sort_order" = v."sira"
FROM (VALUES
  (10, 'Soda Şişe Sade 200 Ml (Beypazarı)'),
  (20, 'Browni Çikolata 50 gr.'),
  (30, 'Mr Brown Vanilla Ice Coffee 240 ml.'),
  (40, 'Küçük Su Cam Logolu (Sırma) 330 Ml'),
  (50, 'Pepsi Max 250 Ml'),
  (60, 'Pepsi Kutu 250 Ml'),
  (70, 'Yedigün Kutu 250 Ml'),
  (80, 'Seven Up Kutu 250 Ml'),
  (90, 'Bira Efes Şişe 33 Cl'),
  (100, 'Redbull 250 ml.'),
  (110, 'Kahve Segafredo Kapsül'),
  (120, 'Mr Brown Black  Ice Coffee'),
  (130, 'Ice Tea Şeftali (Lipton) 330 ML'),
  (140, 'English Breakfast Tea'),
  (150, 'Ice Tea Limon 200 ml.'),
  (160, 'Ülker Çokonat 33 Gr'),
  (170, 'Early Grey Tea'),
  (180, 'Maison Merlot 187 Ml'),
  (190, 'Maison Chardonnay 187 ml'),
  (200, 'Su Cam Logolu (Sırma) 750 Ml'),
  (210, 'Bitki Çayları 2 gr'),
  (220, 'Mateus Rose Original 25 Cl'),
  (230, 'Çerez Fıstık Tuzlu'),
  (240, 'Nescafe Stick 5 gr.'),
  (250, 'Perrier 330 Ml'),
  (260, 'Jp Chenet Ice Edition 20 Cl'),
  (270, 'Pellegrino 250 Ml'),
  (280, 'Nesfit Muzlu ve Çikolatalı 23.5 G'),
  (290, 'Nesfit Kakaolu 23.5 Gr'),
  (300, 'Nesfit Karamelli 23.5 Gr'),
  (310, 'Coffee Mate Stick 5 gr.'),
  (320, 'Nesfit Kırmızı Meyveli 23.5 Gr'),
  (330, 'Stick Şeker 2 gr.'),
  (340, 'Çikolata Snickers 50 Gr'),
  (350, 'Twix Double Chocolate Bar 50 Gr'),
  (360, 'Stick Esmer Şeker 2 gr.'),
  (370, 'Brusc. Cheese'),
  (380, 'Stick Sakarin 1 gr'),
  (390, 'Brusc. Tomato'),
  (400, 'Benimo'),
  (410, 'Sakız Yeşil Nane Aromalı Sakız 27 G'),
  (420, 'Sakız  Çilek Aromalı 27 Gr'),
  (430, 'Eti Cin'),
  (440, 'Cips Pringels 40 Gr'),
  (450, 'Eti Puf'),
  (460, 'Top Kek'),
  (470, 'Haribo'),
  (480, 'Crax Peynirli 50 Gr'),
  (490, 'Ülker Çikolatalı Gofret'),
  (500, 'Ülker Çizi')
) AS v("sira", "name")
WHERE lower(btrim(p."name")) = lower(v."name");
