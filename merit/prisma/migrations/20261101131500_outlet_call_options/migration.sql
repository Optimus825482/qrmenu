-- CreateTable
CREATE TABLE "outlet_call_options" (
    "id" TEXT NOT NULL,
    "outlet_id" TEXT NOT NULL,
    "label" VARCHAR(60) NOT NULL,
    "translations" JSONB NOT NULL DEFAULT '{}',
    "call_type" "CallType" NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "outlet_call_options_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "outlet_call_options_outlet_id_sort_order_idx" ON "outlet_call_options"("outlet_id", "sort_order");

-- AddForeignKey
ALTER TABLE "outlet_call_options" ADD CONSTRAINT "outlet_call_options_outlet_id_fkey" FOREIGN KEY ("outlet_id") REFERENCES "outlets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Initial default call options for existing outlets
INSERT INTO "outlet_call_options" ("id", "outlet_id", "label", "translations", "call_type", "sort_order", "is_active", "created_at", "updated_at")
SELECT
    gen_random_uuid()::text,
    id,
    'Peçete istiyorum',
    '{"en":"Napkins, please","de":"Servietten bitte","ru":"Салфетки, пожалуйста","ar":"مناديل من فضلك"}'::jsonb,
    'GARSON'::"CallType",
    0,
    true,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "outlets";

INSERT INTO "outlet_call_options" ("id", "outlet_id", "label", "translations", "call_type", "sort_order", "is_active", "created_at", "updated_at")
SELECT
    gen_random_uuid()::text,
    id,
    'Sipariş vereceğim',
    '{"en":"I''d like to order","de":"Ich möchte bestellen","ru":"Я хочу сделать заказ","ar":"أرغب في الطلب"}'::jsonb,
    'GARSON'::"CallType",
    1,
    true,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "outlets";

INSERT INTO "outlet_call_options" ("id", "outlet_id", "label", "translations", "call_type", "sort_order", "is_active", "created_at", "updated_at")
SELECT
    gen_random_uuid()::text,
    id,
    'Su istiyorum',
    '{"en":"Water, please","de":"Wasser, bitte","ru":"Воды, пожалуйста","ar":"ماء من فضلك"}'::jsonb,
    'GARSON'::"CallType",
    2,
    true,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "outlets";

INSERT INTO "outlet_call_options" ("id", "outlet_id", "label", "translations", "call_type", "sort_order", "is_active", "created_at", "updated_at")
SELECT
    gen_random_uuid()::text,
    id,
    'Hesap',
    '{"en":"The bill, please","de":"Die Rechnung, bitte","ru":"Счёт, пожалуйста","ar":"الحساب من فضلك"}'::jsonb,
    'HESAP'::"CallType",
    3,
    true,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "outlets";
