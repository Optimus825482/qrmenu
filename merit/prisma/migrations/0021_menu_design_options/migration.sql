ALTER TABLE "menu_nodes" ADD COLUMN "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

ALTER TABLE "outlet_menu_designs" ADD COLUMN "options" JSONB NOT NULL DEFAULT '{}';
