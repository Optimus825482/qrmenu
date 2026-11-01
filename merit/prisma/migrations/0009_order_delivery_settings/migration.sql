ALTER TYPE "PrintJobKind" ADD VALUE 'MUTFAK';

ALTER TABLE "outlets"
  ADD COLUMN "auto_print_receipt" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "auto_print_kitchen" BOOLEAN NOT NULL DEFAULT false;
