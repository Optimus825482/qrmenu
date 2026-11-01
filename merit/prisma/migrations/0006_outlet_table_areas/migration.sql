CREATE TYPE "OutletAreaMode" AS ENUM ('ACIK', 'KAPALI', 'HER_IKISI');
CREATE TYPE "OutletArea" AS ENUM ('ACIK', 'KAPALI');

ALTER TABLE "outlets"
  ADD COLUMN "area_mode" "OutletAreaMode" NOT NULL DEFAULT 'KAPALI',
  ADD COLUMN "open_area_name" VARCHAR(60);

ALTER TABLE "outlet_tables"
  ADD COLUMN "number" INTEGER,
  ADD COLUMN "name" VARCHAR(80),
  ADD COLUMN "capacity" INTEGER,
  ADD COLUMN "area" "OutletArea" NOT NULL DEFAULT 'KAPALI';

WITH numbered AS (
  SELECT "id", ROW_NUMBER() OVER (PARTITION BY "outlet_id" ORDER BY "label", "id")::INTEGER AS "number"
  FROM "outlet_tables"
)
UPDATE "outlet_tables" AS t
SET "number" = numbered."number"
FROM numbered
WHERE t."id" = numbered."id";

ALTER TABLE "outlet_tables"
  ADD CONSTRAINT "outlet_tables_number_positive" CHECK ("number" IS NULL OR "number" > 0),
  ADD CONSTRAINT "outlet_tables_capacity_positive" CHECK ("capacity" IS NULL OR "capacity" > 0);

CREATE UNIQUE INDEX "outlet_tables_outlet_id_number_key" ON "outlet_tables"("outlet_id", "number");
