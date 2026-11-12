-- Oda servisinde telefon teyidi adımı kaldırıldı: hiçbir satış noktası artık teyit istemez.
-- Sütun ve TEYIT_BEKLIYOR durumu geçmiş kayıtlar için durur; yeni sipariş doğrudan GONDERILDI olur.
UPDATE "outlets" SET "phone_confirm_required" = false WHERE "phone_confirm_required" = true;
