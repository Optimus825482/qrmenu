-- UX T2: screen catalogue paths that pointed at pages that do not exist, and the R-OUT landing screen.
-- Mirrors src/modules/core/screens.ts and prisma/seed/roles.ts for databases seeded earlier
-- (fresh databases are seeded after the migrations and already carry these values).
-- The screens stay active: /api/minibar/* uses them as permission gates.

UPDATE "app_screens" SET "path" = '/kat'                  WHERE "code" = 'MB-TUK';
UPDATE "app_screens" SET "path" = '/depo/stok'            WHERE "code" = 'MB-ZIM';
UPDATE "app_screens" SET "path" = '/kat/duzeltme-onay', "name" = 'Düzeltme ve Ek Talepler' WHERE "code" = 'MB-TAL';
UPDATE "app_screens" SET "path" = '/depo/doluluk-yukle'   WHERE "code" = 'MB-DOL';
UPDATE "app_screens" SET "path" = '/kat?filtre=mybar'     WHERE "code" = 'MB-PERS';
UPDATE "app_screens" SET "path" = '/kat?filtre=dnd'       WHERE "code" = 'MB-DND';
UPDATE "app_screens" SET "path" = '/depo/raporlar'        WHERE "code" = 'MB-RAP';
UPDATE "app_screens" SET "path" = '/depo/tanimlar'        WHERE "code" = 'MB-TAN';

-- Outlet staff land on the waiter call screen, not on the guest menu preview.
UPDATE "roles" SET "default_screen" = 'QM-CAG' WHERE "code" = 'R-OUT';
