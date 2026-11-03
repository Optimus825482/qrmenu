import type { Prisma } from "@/generated/prisma/client";
import type { ShellPrefs } from "./types";

type RawExecutor = { $executeRaw(query: TemplateStringsArray, ...values: unknown[]): Prisma.PrismaPromise<number> };

/**
 * Writes `User.prefs.shell` in one statement. The new layout is merged over the stored one, so keys the
 * desktop never sends (`preferredShell`, written by the device setup) survive a save, and concurrent
 * saves cannot drop other `prefs` keys (no read-modify-write). A stored `shell` that is not a JSON
 * object (null, array, scalar) is replaced by an empty one before merging.
 *
 * The merge is shallow (top-level keys). The schema's defaults make the desktop send every key except
 * the optional `preferredShell`. If another optional key is ever added that the desktop must be able to
 * delete, "absent in the payload" will keep the stored value: design a separate deletion path (an
 * explicit `null`-accepting action, as `preferredShell` would also need to be cleared).
 */
export async function writeShellPrefs(db: RawExecutor, userId: string, prefs: ShellPrefs): Promise<void> {
  await db.$executeRaw`
    UPDATE "users"
    SET "prefs" = jsonb_set(
          COALESCE("prefs", '{}'::jsonb),
          '{shell}',
          CASE WHEN jsonb_typeof("prefs"->'shell') = 'object' THEN "prefs"->'shell' ELSE '{}'::jsonb END
            || ${JSON.stringify(prefs)}::jsonb,
          true),
        "updated_at" = CURRENT_TIMESTAMP
    WHERE "id" = ${userId}`;
}
