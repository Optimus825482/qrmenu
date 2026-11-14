-- Guest order notes translated to Turkish for staff (the original stays in `note`).
ALTER TABLE "orders" ADD COLUMN "note_tr" TEXT;
ALTER TABLE "orders" ADD COLUMN "note_src_lang" VARCHAR(8);
ALTER TABLE "order_items" ADD COLUMN "note_tr" TEXT;
