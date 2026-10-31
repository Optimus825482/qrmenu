import "@/shell/theme.css";
import "@/shell/mobile.css";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { visibleScreens } from "@/lib/rbac";
import { getSetting } from "@/lib/settings";
import { loadShellPrefs } from "@/shell/prefsAction";
import { currentUser, permits } from "./guard";
import { ShellClient } from "./ShellClient";

/** The admin desktop is for system and management roles only. */
const SHELL_ROLE_KINDS = new Set(["SISTEM", "YONETIM"]);

export default async function AdminPage() {
  const ctx = await currentUser();
  if (!ctx) redirect("/giris?next=%2Fadmin");
  // The desktop opens on Komuta Merkezi: without it the user has no business here (audited).
  if (!(await permits(ctx, "CR-KOM", "V"))) redirect("/secim");
  if (!SHELL_ROLE_KINDS.has(ctx.user.roleKind)) redirect("/secim");

  const [hotels, prefs, confirmSimpleActions, mobileDefinitions] = await Promise.all([
    prisma.hotel.findMany({
      where: { id: { in: ctx.hotelIds }, isActive: true },
      select: { id: true, name: true, code: true },
      orderBy: { name: "asc" },
    }),
    loadShellPrefs(),
    getSetting("shell.confirmSimpleActions", ctx.session.hotelId),
    getSetting("shell.mobileDefinitions", ctx.session.hotelId),
  ]);
  // Permissions and modules are per hotel: the desktop shows the union, a window bound to a hotel
  // only what that hotel allows.
  const screensByHotel: Record<string, string[]> = Object.fromEntries(
    await Promise.all(hotels.map(async (h) => [h.id, await visibleScreens(ctx, h.id)] as const)),
  );

  return (
    <ShellClient
      user={{ id: ctx.user.id, fullName: ctx.user.fullName, roleId: ctx.user.roleId }}
      hotels={hotels}
      screensByHotel={screensByHotel}
      prefs={prefs}
      confirmSimpleActions={confirmSimpleActions}
      mobileDefinitions={mobileDefinitions}
    />
  );
}
