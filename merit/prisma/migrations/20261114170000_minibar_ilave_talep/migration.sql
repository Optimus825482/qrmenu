-- Minibar ilave talep (14 Kas 2026): units a floor attendant leaves ABOVE the setup quantity at the guest's
-- request are kept apart on the record line, so they can be reported on their own. `added` / `consumed` still
-- hold the whole quantity; `extra_qty` is the part of it that is over the room's daily setup capacity.
ALTER TABLE "minibar_transaction_items" ADD COLUMN "extra_qty" INTEGER NOT NULL DEFAULT 0;

-- Records made since the over-setup button exists (14 Kas 2026) carried the mark only in the audit log.
-- Recomputed here: within a room / product / business day, in time order, whatever goes over the capacity
-- (setup quantity of the line x cabinet copies of an in-cabinet setup) is the extra part of that line.
WITH lines AS (
  SELECT i."id", i."added",
         i."setup_qty" * CASE WHEN COALESCE(s."is_inside_cabinet", false) THEN GREATEST(COALESCE(rt."cabinet_count", 1), 1) ELSE 1 END AS capacity,
         SUM(i."added") OVER (
           PARTITION BY t."room_id", i."product_id", (t."occurred_at" AT TIME ZONE 'Europe/Nicosia')::date
           ORDER BY t."occurred_at", i."id"
         ) AS running
  FROM "minibar_transaction_items" i
  JOIN "minibar_transactions" t ON t."id" = i."transaction_id"
  JOIN "rooms" r ON r."id" = t."room_id"
  LEFT JOIN "room_types" rt ON rt."id" = r."room_type_id"
  LEFT JOIN "setups" s ON s."id" = i."setup_id"
  WHERE t."type"::text = 'SETUP_KONTROL'
    AND t."occurred_at" >= TIMESTAMPTZ '2026-11-13 22:00:00+00'
)
UPDATE "minibar_transaction_items" i
SET "extra_qty" = LEAST(l."added", l.running - l.capacity)
FROM lines l
WHERE l."id" = i."id" AND l.capacity > 0 AND l.running > l.capacity;
