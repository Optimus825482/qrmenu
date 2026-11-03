"use server";

import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { safeAction, type Result } from "@/lib/result";
import { parseShellPrefs, shellPrefsSchema } from "./prefsSchema";
import { writeShellPrefs } from "./prefsStore";
import type { ShellPrefs } from "./types";

/**
 * Server Actions for the shell's per-user layout (`User.prefs.shell`). The client debounces
 * saves (1 s) and keeps a localStorage copy; other keys of `User.prefs` are left untouched.
 */

export async function saveShellPrefs(p: ShellPrefs): Promise<Result<null>> {
  return safeAction(shellPrefsSchema, async (prefs) => {
    const ctx = await requireUser();
    await writeShellPrefs(prisma, ctx.user.id, prefs);
    return null;
  })(p);
}

export async function loadShellPrefs(): Promise<ShellPrefs | null> {
  const ctx = await requireUser();
  const user = await prisma.user.findUnique({
    where: { id: ctx.user.id },
    select: { prefs: true },
  });
  const prefs = user?.prefs;
  if (!prefs || typeof prefs !== "object" || Array.isArray(prefs)) return null;
  return parseShellPrefs((prefs as Record<string, unknown>).shell);
}
