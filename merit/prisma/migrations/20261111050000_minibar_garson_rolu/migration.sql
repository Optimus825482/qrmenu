-- R-KAT rolunun gorunen adi: "Kat Sorumlusu" -> "Minibar Garson" (yetkiler ve rol kodu ayni kalir).
UPDATE "roles" SET "name" = 'Minibar Garson', "updated_at" = now() WHERE "code" = 'R-KAT' AND "name" = 'Kat Sorumlusu';
