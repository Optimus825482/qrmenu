-- MMD (misafir musait degil) kaydi: kat gorevlisi odaya gitti ama giremedi. DND degildir; DND kontrol sayisina
-- girmez, odayi ya da gorevini tamamlamaz. Yalnizca kim, ne zaman, hangi sebeple kaydidir (raporlar icin).
CREATE TABLE "room_mmds" (
    "id" TEXT NOT NULL,
    "hotel_id" TEXT NOT NULL,
    "room_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" VARCHAR(200) NOT NULL,
    "client_request_id" TEXT,
    CONSTRAINT "room_mmds_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "room_mmds_client_request_id_key" ON "room_mmds"("client_request_id");
CREATE INDEX "room_mmds_hotel_id_date_idx" ON "room_mmds"("hotel_id", "date");
CREATE INDEX "room_mmds_room_id_date_idx" ON "room_mmds"("room_id", "date");
CREATE INDEX "room_mmds_user_id_at_idx" ON "room_mmds"("user_id", "at");
ALTER TABLE "room_mmds" ADD CONSTRAINT "room_mmds_hotel_id_fkey" FOREIGN KEY ("hotel_id") REFERENCES "hotels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "room_mmds" ADD CONSTRAINT "room_mmds_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "room_mmds" ADD CONSTRAINT "room_mmds_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
