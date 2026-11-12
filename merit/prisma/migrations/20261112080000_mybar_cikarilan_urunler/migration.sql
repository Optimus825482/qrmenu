-- MyBar kisisellestirme: misafirin minibardan cikarilmasini istedigi setup urunleri.
CREATE TABLE "mybar_request_removals" (
    "id" TEXT NOT NULL,
    "request_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "requested_qty" INTEGER NOT NULL,
    "removed_qty" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "mybar_request_removals_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "mybar_request_removals_request_id_product_id_key" ON "mybar_request_removals"("request_id", "product_id");

ALTER TABLE "mybar_request_removals" ADD CONSTRAINT "mybar_request_removals_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "mybar_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "mybar_request_removals" ADD CONSTRAINT "mybar_request_removals_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
