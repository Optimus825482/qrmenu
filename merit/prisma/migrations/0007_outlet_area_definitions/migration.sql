CREATE TABLE "outlet_areas" (
  "id" TEXT NOT NULL,
  "outlet_id" TEXT NOT NULL,
  "type" "OutletArea" NOT NULL,
  "name" VARCHAR(60),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "outlet_areas_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "outlet_areas_outlet_id_idx" ON "outlet_areas"("outlet_id");
CREATE UNIQUE INDEX "outlet_areas_outlet_id_type_name_key" ON "outlet_areas"("outlet_id", "type", "name");
ALTER TABLE "outlet_areas"
  ADD CONSTRAINT "outlet_areas_outlet_id_fkey"
  FOREIGN KEY ("outlet_id") REFERENCES "outlets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Convert each outlet's former area mode into its initial selectable areas.
INSERT INTO "outlet_areas" ("id", "outlet_id", "type", "name")
SELECT 'legacy-' || o."id" || '-open', o."id", 'ACIK', NULLIF(BTRIM(o."open_area_name"), '')
FROM "outlets" o
WHERE o."area_mode" IN ('ACIK', 'HER_IKISI');

INSERT INTO "outlet_areas" ("id", "outlet_id", "type", "name")
SELECT 'legacy-' || o."id" || '-closed', o."id", 'KAPALI', NULL
FROM "outlets" o
WHERE o."area_mode" IN ('KAPALI', 'HER_IKISI');

-- Also cover legacy tables if old data was written outside the outlet's configured mode.
INSERT INTO "outlet_areas" ("id", "outlet_id", "type", "name")
SELECT 'legacy-' || t."outlet_id" || '-' || LOWER(t."area"::TEXT), t."outlet_id", t."area", NULL
FROM (SELECT DISTINCT "outlet_id", "area" FROM "outlet_tables") t
WHERE NOT EXISTS (
  SELECT 1 FROM "outlet_areas" a WHERE a."outlet_id" = t."outlet_id" AND a."type" = t."area"
);

ALTER TABLE "outlet_tables" ADD COLUMN "area_id" TEXT;
UPDATE "outlet_tables" t
SET "area_id" = a."id"
FROM "outlet_areas" a
WHERE a."outlet_id" = t."outlet_id"
  AND a."type" = t."area";

ALTER TABLE "outlet_tables" ALTER COLUMN "area_id" SET NOT NULL;
ALTER TABLE "outlet_tables"
  ADD CONSTRAINT "outlet_tables_area_id_fkey"
  FOREIGN KEY ("area_id") REFERENCES "outlet_areas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "outlet_tables_area_id_idx" ON "outlet_tables"("area_id");
ALTER TABLE "outlet_tables" DROP COLUMN "area";

ALTER TABLE "outlets" DROP COLUMN "area_mode", DROP COLUMN "open_area_name";
DROP TYPE "OutletAreaMode";
