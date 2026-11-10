-- Il Delizioso Gelato Royal's: logo gorseli kaldirilmisti; kutuphanedeki dondurma kupasi gorseline baglanir. Tekrarlanabilir.
UPDATE "menu_nodes"
SET "image_url" = '/merit-menus/5e1b4f57c045755b9094de3f.webp', "image_urls" = ARRAY['/merit-menus/5e1b4f57c045755b9094de3f.webp'], "updated_at" = CURRENT_TIMESTAMP
WHERE "name" = 'Il Delizioso Gelato Royal''s' AND "kind" = 'OGE' AND "image_url" IS NULL;
