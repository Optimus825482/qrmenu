import type { Prisma } from "@/generated/prisma/client";
import type { ShellPrefs } from "./types";

type RawExecutor = { $executeRaw(query: TemplateStringsArray, ...values: unknown[]): Prisma.PrismaPromise<number> };

/**
 * Writes `User.prefs.shell` in one statement. The new layout is merged over the stored one, so keys the
 * desktop never sends (`preferredShell`, written by the device setup) survive a save, and concurrent
 * saves cannot drop other `prefs` keys (no read-modify-write).
 */
export async function writeShellPrefs(db: RawExecutor, userId: string, prefs: ShellPrefs): Promise<void> {
  await db.$executeRaw`
    UPDATE "users"
    SET "prefs" = jsonb_set(
          COALESCE("prefs", '{}'::jsonb),
          '{shell}',
          COALESCE("prefs"->'shell', '{}'::jsonb) || ${JSON.stringify(prefs)}::jsonb,
          true),
        "updated_at" = CURRENT_TIMESTAMP
    WHERE "id" = ${userId}`;
}
