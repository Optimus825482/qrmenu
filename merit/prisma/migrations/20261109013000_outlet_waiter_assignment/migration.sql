-- AlterTable
ALTER TABLE "outlets" ADD COLUMN "waiter_assignment_enabled" BOOLEAN NOT NULL DEFAULT false,
ALTER COLUMN "ordering_enabled" SET DEFAULT false;
