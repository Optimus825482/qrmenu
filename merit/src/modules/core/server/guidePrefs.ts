import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { businessDate } from "@/lib/time";

/** `User.prefs.guide`: welcome acknowledgement, seen tour versions and the daily checklist ticks. */
export const guidePrefsSchema = z.object({
  welcomeSeenHash: z.string().max(40).optional(),
  seen: z.record(z.string(), z.number().int()).default({}),
  checklist: z.record(z.string(), z.array(z.string().max(60)).max(40)).default({}),
});
export type GuidePrefs = z.infer<typeof guidePrefsSchema>;

export const CHECKLIST_KEEP_DAYS = 7;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** True only for a throwaway test database (name ends in _e2e or _test): never a real installation. */
function onTestDatabase(): boolean {
  try {
    return /_(e2e|test)$/.test(new URL(process.env.DATABASE_URL ?? "").pathname.replace(/^\//, ""));
  } catch {
    return false;
  }
}

/**
 * e2e escape hatch: a stored "*" counts as every hash, but only outside production or on a
 * `*_e2e` / `*_test` database (the e2e server runs `next start`, i.e. NODE_ENV=production).
 */
export function welcomeMatches(stored: string | undefined, hash: string): boolean {
  if (stored === undefined) return false;
  if (stored === "*") return process.env.NODE_ENV !== "production" || onTestDatabase();
  return stored === hash;
}

export function parseGuidePrefs(prefs: unknown): GuidePrefs {
  const raw = prefs && typeof prefs === "object" && !Array.isArray(prefs) ? (prefs as Record<string, unknown>).guide : undefined;
  const parsed = guidePrefsSchema.safeParse(raw ?? {});
  return parsed.success ? parsed.data : guidePrefsSchema.parse({});
}

/** Drops checklist days older than the last 7 business days (today included). */
export function pruneChecklist(checklist: GuidePrefs["checklist"], today: string): GuidePrefs["checklist"] {
  const [y, m, d] = today.split("-").map(Number);
  const cutoff = new Date(Date.UTC(y, m - 1, d - (CHECKLIST_KEEP_DAYS - 1))).toISOString().slice(0, 10);
  return Object.fromEntries(Object.entries(checklist).filter(([day]) => DAY.test(day) && day >= cutoff));
}

/**
 * Serialised read-modify-write of `prefs.guide` (row lock), so concurrent writers never lose an
 * update and the sibling `prefs.shell` key is carried over untouched.
 */
async function updateGuide(userId: string, change: (current: GuidePrefs) => GuidePrefs): Promise<GuidePrefs> {
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<{ prefs: unknown }[]>`
      SELECT "prefs" FROM "users" WHERE "id" = ${userId} FOR UPDATE`;
    const next = guidePrefsSchema.parse(change(parseGuidePrefs(rows[0]?.prefs)));
    await tx.$executeRaw`
      UPDATE "users"
      SET "prefs" = COALESCE("prefs", '{}'::jsonb) || jsonb_build_object('guide', ${JSON.stringify(next)}::jsonb),
          "updated_at" = CURRENT_TIMESTAMP
      WHERE "id" = ${userId}`;
    return next;
  });
}

export async function readGuidePrefs(userId: string): Promise<GuidePrefs> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { prefs: true } });
  return parseGuidePrefs(user?.prefs);
}

export function setWelcomeSeen(userId: string, hash: string): Promise<GuidePrefs> {
  return updateGuide(userId, (g) => ({ ...g, welcomeSeenHash: hash }));
}

export function setGuideSeen(userId: string, code: string, version: number): Promise<GuidePrefs> {
  return updateGuide(userId, (g) => ({ ...g, seen: { ...g.seen, [code]: version } }));
}

export function setChecklistItem(
  userId: string,
  day: string,
  itemId: string,
  checked: boolean,
  today: string = businessDate(),
): Promise<GuidePrefs> {
  return updateGuide(userId, (g) => {
    const ticked = new Set(g.checklist[day] ?? []);
    if (checked) ticked.add(itemId);
    else ticked.delete(itemId);
    return { ...g, checklist: pruneChecklist({ ...g.checklist, [day]: [...ticked] }, today) };
  });
}
