CREATE TABLE "outlet_menu_designs" (
    "id" TEXT NOT NULL,
    "outlet_id" TEXT NOT NULL,
    "ambience" VARCHAR(32) NOT NULL DEFAULT 'RESORT',
    "concept" VARCHAR(32) NOT NULL DEFAULT 'LUXURY',
    "template" VARCHAR(32) NOT NULL DEFAULT 'ROYAL',
    "layout" JSONB NOT NULL DEFAULT '["hero","categories","items"]',
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "outlet_menu_designs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "outlet_menu_designs_outlet_id_key" ON "outlet_menu_designs"("outlet_id");

ALTER TABLE "outlet_menu_designs"
ADD CONSTRAINT "outlet_menu_designs_outlet_id_fkey"
FOREIGN KEY ("outlet_id") REFERENCES "outlets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
