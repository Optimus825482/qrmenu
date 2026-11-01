UPDATE "outlet_tables" AS table_row
SET "label" = outlet."name" || ' ' || table_row."number"::text ||
  CASE
    WHEN table_row."name" IS NOT NULL AND trim(table_row."name") <> ''
      THEN ' · ' || trim(table_row."name")
    ELSE ''
  END
FROM "outlets" AS outlet
WHERE table_row."outlet_id" = outlet."id"
  AND table_row."number" IS NOT NULL;
