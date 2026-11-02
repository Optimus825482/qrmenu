-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "delivered_at" TIMESTAMPTZ(3),
ADD COLUMN     "delivered_by_id" TEXT,
ADD COLUMN     "on_way_at" TIMESTAMPTZ(3),
ADD COLUMN     "sla_breached_at" TIMESTAMPTZ(3),
ADD COLUMN     "sla_warned_at" TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "rooms" ADD COLUMN     "extension" VARCHAR(20);

-- CreateIndex
CREATE INDEX "orders_room_id_status_idx" ON "orders"("room_id", "status");

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_delivered_by_id_fkey" FOREIGN KEY ("delivered_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
