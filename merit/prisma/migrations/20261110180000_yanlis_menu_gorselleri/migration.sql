-- Gorsel incelemesi (10 Kas 2026): yanlis urunu gosteren 9 gorsel menu ogelerinden kaldirilir (14 satir:
-- Glenfiddich 18 Y.O. (Glenlivet sisesi), Tavuk Kkochi ve Il Delizioso Gelato (logo), Patates Kizartmasi (noodle),
-- Blue Sea: Antep Biberli Atom, Babagannus, Saksuka, Deniz Baligi Ceviche, Deniz Mahsullu Pazi Sarma).
-- Bu dosyalari baska hicbir urun kullanmaz. Tekrarlanabilir. Liste: docs/analiz/2026-11-10-menu-gorsel-inceleme.md
UPDATE "menu_nodes"
SET "image_url" = NULL, "image_urls" = ARRAY(SELECT u FROM unnest("image_urls") AS u WHERE u <> "image_url"), "updated_at" = CURRENT_TIMESTAMP
WHERE "image_url" IN (
  '/merit-menus/cac0d4499d49af030cf05a00.webp',
  '/uploads/merit-menus/cac0d4499d49af030cf05a00.webp',
  '/merit-menus/a218bb18cd40a0c9d2dcf36f.webp',
  '/uploads/merit-menus/a218bb18cd40a0c9d2dcf36f.webp',
  '/merit-menus/b8c88956f70f97a485fe9bfc.webp',
  '/uploads/merit-menus/b8c88956f70f97a485fe9bfc.webp',
  '/merit-menus/ee138bdb35ca229cd7e128f9.webp',
  '/uploads/merit-menus/ee138bdb35ca229cd7e128f9.webp',
  '/merit-menus/8b630f4ce5095f5f446e2594.webp',
  '/uploads/merit-menus/8b630f4ce5095f5f446e2594.webp',
  '/merit-menus/9f2f2e95f0017e50ec5d5517.webp',
  '/uploads/merit-menus/9f2f2e95f0017e50ec5d5517.webp',
  '/merit-menus/091008dd9cad58ae11208e20.webp',
  '/uploads/merit-menus/091008dd9cad58ae11208e20.webp',
  '/merit-menus/c0b4248c1954679937c88ee0.webp',
  '/uploads/merit-menus/c0b4248c1954679937c88ee0.webp',
  '/merit-menus/ea3130a44ac54040038d97ad.webp',
  '/uploads/merit-menus/ea3130a44ac54040038d97ad.webp'
);
