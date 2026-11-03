import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DomainError } from "@/lib/result";
import { ConfirmHost } from "@/components/ui/ConfirmHost";
import { OpsShell } from "@/components/ops/OpsShell";
import { listTargets } from "@/modules/core/server/targets";
import { loadPosShellData } from "./posShellData";

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
  return <OpsShell outletName={outlet.name} hotelName={outlet.hotel.name} fullName={ctx.user.fullName} targets={targets} outletId={outlet.id} pos={pos}><ConfirmHost variant="sheet" />{children}</OpsShell>;
}
