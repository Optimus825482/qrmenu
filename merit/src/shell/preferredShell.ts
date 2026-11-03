import { prisma } from "@/lib/prisma";
import { parseShellPrefs } from "./prefsSchema";
import type { ShellKind } from "./resolveShell";

/**
 * Kullanıcının kayıtlı kabuk tercihi (`User.prefs.shell.preferredShell`); yoksa ya da bozuksa `null`.
 * Tercih yalnız rolüne izin verilen kabuklar arasından uygulanır (`resolveShell`), yetki vermez.
 */
export async function loadPreferredShell(userId: string): Promise<ShellKind | null> {
  const row = await prisma.user.findUnique({ where: { id: userId }, select: { prefs: true } });
  const prefs = row?.prefs;
  if (!prefs || typeof prefs !== "object" || Array.isArray(prefs)) return null;
  return parseShellPrefs((prefs as Record<string, unknown>).shell)?.preferredShell ?? null;
}
