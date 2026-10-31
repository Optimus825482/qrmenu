/*
  Warnings:

  - Added the required column `updated_at` to the `email_logs` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updated_at` to the `notifications` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updated_at` to the `push_subscriptions` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "orders" DROP CONSTRAINT "orders_room_id_fkey";

-- DropForeignKey
ALTER TABLE "orders" DROP CONSTRAINT "orders_table_id_fkey";

-- AlterTable
ALTER TABLE "email_logs" ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "menu_nodes" ALTER COLUMN "allergens" SET DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "notifications" ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "push_subscriptions" ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "task_status_logs" ALTER COLUMN "from" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "daily_task_items_task_id_idx" ON "daily_task_items"("task_id");

-- CreateIndex
CREATE INDEX "order_events_order_id_idx" ON "order_events"("order_id");

-- CreateIndex
CREATE INDEX "order_items_order_id_idx" ON "order_items"("order_id");

-- CreateIndex
CREATE INDEX "print_jobs_printer_id_status_idx" ON "print_jobs"("printer_id", "status");

-- CreateIndex
CREATE INDEX "waiter_calls_outlet_id_status_idx" ON "waiter_calls"("outlet_id", "status");

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_table_id_fkey" FOREIGN KEY ("table_id") REFERENCES "outlet_tables"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Partial unique indexes: Postgres treats NULLs as distinct, so the compound uniques
-- that include a nullable hotel_id do not protect the system-wide (hotel_id IS NULL) rows.
CREATE UNIQUE INDEX "settings_system_key" ON "settings"("key") WHERE "hotel_id" IS NULL;

CREATE UNIQUE INDEX "role_screen_permissions_global" ON "role_screen_permissions"("role_id", "screen_id") WHERE "hotel_id" IS NULL;

CREATE UNIQUE INDEX "role_module_access_global" ON "role_module_accesses"("role_id", "module_key") WHERE "hotel_id" IS NULL;

-- At most one room-service outlet per hotel.
CREATE UNIQUE INDEX "outlets_one_room_service_per_hotel" ON "outlets"("hotel_id") WHERE "type" = 'ODA_SERVISI';

-- Quantity sanity checks.
ALTER TABLE "setup_items" ADD CONSTRAINT "setup_items_qty_check" CHECK ("qty" >= 1);

ALTER TABLE "mybar_request_items" ADD CONSTRAINT "mybar_request_items_requested_qty_check" CHECK ("requested_qty" >= 1);
