-- Oteller arasi oda servisi izleme / isleme: bir kullaniciya, kendi oteli disindaki bir otelin oda servisi
-- taleplerini belirli bir sure izleme (IZLEME) ya da isleme (ISLEME) izni. Oturumun otel kapsamini genisletmez;
-- yalnizca oda servisi kod yollari bakar. Gecerlilik her kullanimda sunucuda denetlenir (revoked_at, starts_at,
-- ends_at); sure dolunca izin kendiliginden biter, zamanlanmis is gerekmez.
CREATE TYPE "RoomServiceCoverageMode" AS ENUM ('IZLEME', 'ISLEME');
CREATE TABLE "room_service_coverages" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "hotel_id" TEXT NOT NULL,
    "mode" "RoomServiceCoverageMode" NOT NULL,
    "starts_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ends_at" TIMESTAMPTZ(3),
    "revoked_at" TIMESTAMPTZ(3),
    "revoked_by_id" TEXT,
    "granted_by_id" TEXT NOT NULL,
    "note" VARCHAR(200),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "room_service_coverages_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "room_service_coverages_user_id_hotel_id_idx" ON "room_service_coverages"("user_id", "hotel_id");
CREATE INDEX "room_service_coverages_user_id_revoked_at_ends_at_idx" ON "room_service_coverages"("user_id", "revoked_at", "ends_at");
CREATE INDEX "room_service_coverages_hotel_id_revoked_at_ends_at_idx" ON "room_service_coverages"("hotel_id", "revoked_at", "ends_at");
ALTER TABLE "room_service_coverages" ADD CONSTRAINT "room_service_coverages_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "room_service_coverages" ADD CONSTRAINT "room_service_coverages_hotel_id_fkey" FOREIGN KEY ("hotel_id") REFERENCES "hotels"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "room_service_coverages" ADD CONSTRAINT "room_service_coverages_granted_by_id_fkey" FOREIGN KEY ("granted_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "room_service_coverages" ADD CONSTRAINT "room_service_coverages_revoked_by_id_fkey" FOREIGN KEY ("revoked_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
