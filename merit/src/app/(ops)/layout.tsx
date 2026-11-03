import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DomainError } from "@/lib/result";
import { ConfirmHost } from "@/components/ui/ConfirmHost";
import { OpsShell } from "@/components/ops/OpsShell";
import { loadStaffShellProps } from "@/components/staff/loadShellProps";
import { loadPreferredShell } from "@/shell/preferredShell";
import { listTargets } from "@/modules/core/server/targets";
import { loadPosShellData } from "./posShellData";

export const metadata: Metadata = { manifest: "/personel.webmanifest" };

export default async function OpsLayout({ children }: { children: React.ReactNode }) {
  let ctx;
  try { ctx = await requireUser(); } catch (error) {
    if (error instanceof DomainError && error.code === "UNAUTHORIZED") {
      const path = (await headers()).get("x-merit-current-path") ?? "/garson";
      redirect(`/giris?next=${encodeURIComponent(path)}`);
    }
    throw error;
  }
  let outletId = ctx.session.outletId;
  if (!outletId && ctx.session.hotelId) {
    const rsOutlet = await prisma.outlet.findFirst({
      where: { hotelId: ctx.session.hotelId, type: "ODA_SERVISI" },
      select: { id: true },
    });
    if (rsOutlet) outletId = rsOutlet.id;
  }
  if (!outletId) redirect("/secim");
  const outlet = await prisma.outlet.findUnique({ where: { id: outletId }, include: { hotel: { select: { name: true } } } });
  if (!outlet) redirect("/secim");
  const targets = (await listTargets(ctx.user.id)).map((target, index) => ({ target, index })).filter(({ target }) => target.kind === "OUTLET").map(({ target, index }) => ({ index, label: target.label }));
  const pos = await loadPosShellData(ctx, outlet);
  const path = (await headers()).get("x-merit-current-path") ?? "/garson";
  const staff = await loadStaffShellProps(ctx, path, { outletId: outlet.id });
  // Only the touch screens (kasa, KDS) can switch to the POS shell, so only they read the saved preference.
  const preferredShell = /^\/(kasa|kds)(\/|$)/.test(path) ? await loadPreferredShell(ctx.user.id) : null;
  // Session-hotel scope on purpose (QS-KAS V in the outlet's hotel, derived in loadPosShellData); /baslat
  // derives it hotel-independently for the sign-in landing. Neither grants actions, only the shell view.
  const canUsePos = pos.kasa !== null;
  return <OpsShell roleKind={ctx.user.roleKind} canUsePos={canUsePos} preferredShell={preferredShell} outletName={outlet.name} hotelName={outlet.hotel.name} fullName={ctx.user.fullName} targets={targets} outletId={outlet.id} pos={pos} staff={staff}><ConfirmHost variant="sheet" />{children}</OpsShell>;
}
