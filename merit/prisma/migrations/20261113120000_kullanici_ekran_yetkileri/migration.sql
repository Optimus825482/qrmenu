-- Kişiye özel yetki istisnaları (13 Kas 2026). Yalnız rolden farklı olan yetkiler saklanır:
-- NULL = rolden gelir, true = ek verildi, false = kısıtlandı. Mevcut veri değişmez; tablo boş başlar.

CREATE TABLE "user_screen_permissions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "screen_id" TEXT NOT NULL,
    "can_view" BOOLEAN,
    "can_create" BOOLEAN,
    "can_edit" BOOLEAN,
    "can_approve" BOOLEAN,
    "can_report" BOOLEAN,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "user_screen_permissions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "user_screen_permissions_user_id_screen_id_key" ON "user_screen_permissions"("user_id", "screen_id");

ALTER TABLE "user_screen_permissions" ADD CONSTRAINT "user_screen_permissions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "user_screen_permissions" ADD CONSTRAINT "user_screen_permissions_screen_id_fkey" FOREIGN KEY ("screen_id") REFERENCES "app_screens"("id") ON DELETE CASCADE ON UPDATE CASCADE;
