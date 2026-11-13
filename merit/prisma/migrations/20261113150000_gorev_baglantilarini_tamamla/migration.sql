-- Users whose görev text matches a catalogue title but carry no link (titles added to the catalogue after
-- the first backfill, imported accounts). Without the link the Görevler screen undercounts them.
UPDATE "users" u SET "job_title_id" = j."id"
  FROM "job_titles" j
  WHERE u."job_title_id" IS NULL AND u."job_title" IS NOT NULL AND lower(btrim(u."job_title")) = lower(j."name");
