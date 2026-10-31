-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "assigned_waiter_id" TEXT,
ADD COLUMN     "escalated_at" TIMESTAMPTZ(3),
ADD COLUMN     "prep_started_at" TIMESTAMPTZ(3),
ADD COLUMN     "rejected_at" TIMESTAMPTZ(3),
ADD COLUMN     "served_by_id" TEXT;

-- AlterTable
-- hotel_id is added nullable, back-filled from the printer, then made NOT NULL (existing rows).
ALTER TABLE "print_jobs" ADD COLUMN     "hotel_id" TEXT,
ADD COLUMN     "started_at" TIMESTAMPTZ(3);

UPDATE "print_jobs" j SET "hotel_id" = p."hotel_id" FROM "printers" p WHERE j."printer_id" = p."id";

ALTER TABLE "print_jobs" ALTER COLUMN "hotel_id" SET NOT NULL;

-- AlterTable
ALTER TABLE "waiter_calls" ADD COLUMN     "note" VARCHAR(200);

-- CreateIndex
CREATE INDEX "menu_nodes_outlet_id_kind_is_active_idx" ON "menu_nodes"("outlet_id", "kind", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "menu_themes_name_key" ON "menu_themes"("name");

-- CreateIndex
CREATE INDEX "print_jobs_hotel_id_status_created_at_idx" ON "print_jobs"("hotel_id", "status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "printers_hotel_id_name_key" ON "printers"("hotel_id", "name");

-- CreateIndex
CREATE INDEX "waiter_calls_table_id_status_idx" ON "waiter_calls"("table_id", "status");

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_assigned_waiter_id_fkey" FOREIGN KEY ("assigned_waiter_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_served_by_id_fkey" FOREIGN KEY ("served_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "print_jobs" ADD CONSTRAINT "print_jobs_hotel_id_fkey" FOREIGN KEY ("hotel_id") REFERENCES "hotels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- At most one active assignment per table. Older duplicates (none expected) are closed first.
UPDATE "table_assignments" a SET "is_active" = false
WHERE a."is_active" AND EXISTS (
  SELECT 1 FROM "table_assignments" b
  WHERE b."table_id" = a."table_id" AND b."is_active"
    AND (b."created_at" > a."created_at" OR (b."created_at" = a."created_at" AND b."id" > a."id"))
);

CREATE UNIQUE INDEX "table_assignments_one_active" ON "table_assignments"("table_id") WHERE "is_active";

-- P5 permission matrix (system rows only). Mirrors P5_SCREEN_LIMITS in prisma/seed/roles.ts.
-- Fresh databases have no rows here (the seed runs after the migrations and already applies the limits).
DELETE FROM "role_screen_permissions" p USING "roles" r, "app_screens" s
WHERE p."role_id" = r."id" AND p."screen_id" = s."id" AND p."hotel_id" IS NULL
  AND (
    (r."code" IN ('R-GAR', 'R-BAR', 'R-BUT', 'R-OUT', 'R-ODS') AND s."code" IN ('QM-RAP', 'QS-RAP', 'QS-KAS', 'QS-FIS', 'QS-IPT'))
    OR (r."code" IN ('R-MUS', 'R-MUP', 'R-KDS') AND s."code" IN ('QS-KAS', 'QS-FIS', 'QS-IPT', 'QM-MEN', 'QM-TEM', 'QM-RAP'))
  );

UPDATE "role_screen_permissions" p
SET "can_create" = false, "can_edit" = false, "can_approve" = false, "can_report" = false
FROM "roles" r, "app_screens" s
WHERE p."role_id" = r."id" AND p."screen_id" = s."id" AND p."hotel_id" IS NULL
  AND (
    (r."code" IN ('R-GAR', 'R-BAR', 'R-BUT', 'R-OUT', 'R-ODS') AND s."code" IN ('QM-MEN', 'QM-TEM', 'QS-KDS'))
    OR (r."code" IN ('R-MUS', 'R-MUP', 'R-KDS') AND s."code" = 'QS-KUY')
  );

UPDATE "role_screen_permissions" p
SET "can_approve" = false
FROM "roles" r, "app_screens" s
WHERE p."role_id" = r."id" AND p."screen_id" = s."id" AND p."hotel_id" IS NULL
  AND s."code" IN ('QS-KUY', 'QS-IPT')
  AND r."code" NOT IN ('R-SYS', 'R-OTM', 'R-FBM', 'R-SGF', 'R-KAS');
