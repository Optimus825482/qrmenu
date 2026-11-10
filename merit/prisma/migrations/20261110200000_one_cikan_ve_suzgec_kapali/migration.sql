-- Urun sahibi karari (10 Kas 2026): hicbir misafir menusunde "One cikanlar" bolumu ve etiket suzgecleri gosterilmez.
-- Kayitli tum satis noktasi tasarimlarinda iki secenek kapatilir; operator Tasarim Studyosu'ndan yeniden acabilir.
-- Tekrarlanabilir.
UPDATE "outlet_menu_designs"
SET "options" = "options"::jsonb || '{"showFilters": false, "showFeatured": false}'::jsonb, "updated_at" = CURRENT_TIMESTAMP
-- Bos secenekli ({}) tasarim sablon on ayarini kullanir (on ayarda ikisi de kapali); ona dokunulmaz.
WHERE "options"::jsonb <> '{}'::jsonb
  AND (("options"::jsonb ->> 'showFilters') IS DISTINCT FROM 'false'
    OR ("options"::jsonb ->> 'showFeatured') IS DISTINCT FROM 'false');
