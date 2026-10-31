import "@/shell/theme.css";
import { redirect } from "next/navigation";
import { requireUser, type Ctx } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { visibleScreens } from "@/lib/rbac";
import { DomainError } from "@/lib/result";
import { getSetting } from "@/lib/settings";
import { loadShellPrefs } from "@/shell/prefsAction";
import { ShellClient } from "./ShellClient";

/** The admin desktop is for system and management roles only. */
const SHELL_ROLE_KINDS = new Set(["SISTEM", "YONETIM"]);

async function currentUser(): Promise<Ctx | null> {
  try {
    return await requireUser();
  } catch (error) {
    if (error instanceof DomainError && error.code === "UNAUTHORIZED") return null;
    throw error;
  }
}

export default async function AdminPage() {
  const ctx = await currentUser();
  if (!ctx) redirect("/giris?next=%2Fadmin");
  if (!SHELL_ROLE_KINDS.has(ctx.user.roleKind)) redirect("/secim");

  const [screens, hotels, prefs, confirmSimpleActions] = await Promise.all([
    visibleScreens(ctx),
    prisma.hotel.findMany({
      where: { id: { in: ctx.hotelIds }, isActive: true },
      select: { id: true, name: true, code: true },
      orderBy: { name: "asc" },
    }),
    loadShellPrefs(),
    getSetting("shell.confirmSimpleActions", ctx.session.hotelId),
  ]);

  return (
    <ShellClient
      user={{ id: ctx.user.id, fullName: ctx.user.fullName }}
      hotels={hotels}
      screens={screens}
      prefs={prefs}
      confirmSimpleActions={confirmSimpleActions}
    />
  );
}
