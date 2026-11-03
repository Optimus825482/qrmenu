import { prisma } from "@/lib/prisma";

/** `User.prefs` as a plain object (null / non-object prefs read as empty). */
export async function readUserPrefs(userId: string): Promise<Record<string, unknown>> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { prefs: true } });
  const prefs = user?.prefs;
  return prefs && typeof prefs === "object" && !Array.isArray(prefs) ? (prefs as Record<string, unknown>) : {};
}

/**
 * Sets one top-level key of `User.prefs` in a single statement (no read-modify-write), so the
 * `shell` and `guide` keys never overwrite each other.
 */
export async function mergeUserPrefs(userId: string, key: string, value: unknown): Promise<void> {
  await prisma.$executeRaw`
    UPDATE "users"
    SET "prefs" = COALESCE("prefs", '{}'::jsonb) || jsonb_build_object(${key}::text, ${JSON.stringify(value)}::jsonb),
        "updated_at" = CURRENT_TIMESTAMP
    WHERE "id" = ${userId}`;
}
