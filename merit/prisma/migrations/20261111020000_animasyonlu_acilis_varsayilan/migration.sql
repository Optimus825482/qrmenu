-- Urun sahibi karari (11 Kas 2026): butun QR menuler, bulundugu otelin logosunun animasyonlu girisiyle acilir.
-- Kayitli tum satis noktasi tasarimlarinda "introSplash" acilir; operator Tasarim Studyosu'ndan tek tek kapatabilir.
-- Bos secenekli ({}) tasarim sablon on ayarini kullanir (on ayarda acik); ona dokunulmaz. Tekrarlanabilir.
UPDATE "outlet_menu_designs"
SET "options" = "options"::jsonb || '{"introSplash": true}'::jsonb, "updated_at" = CURRENT_TIMESTAMP
WHERE "options"::jsonb <> '{}'::jsonb
  AND ("options"::jsonb ->> 'introSplash') IS DISTINCT FROM 'true';
