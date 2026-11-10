-- Glenfiddich 18 Y.O.: onceki migration yanlis (Glenlivet) gorseli kaldirdi; gorselsiz kalan ogeler diger satis
-- noktalarinda kullanilan dogru Glenfiddich 18 gorseline baglanir. Tekrarlanabilir.
UPDATE "menu_nodes"
SET "image_url" = '/merit-menus/cd9583d15fd4b117459eed7d.webp', "image_urls" = ARRAY['/merit-menus/cd9583d15fd4b117459eed7d.webp'], "updated_at" = CURRENT_TIMESTAMP
WHERE "name" = 'Glenfiddich 18 Y.O.' AND "kind" = 'OGE' AND "image_url" IS NULL;
