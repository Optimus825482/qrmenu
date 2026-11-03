"use client";

import { useMemo } from "react";
import { usePathname } from "next/navigation";
import { DeviceSetupPrompt } from "@/components/pos/DeviceSetupPrompt";
import { PosShell, type PosRailItem } from "@/components/pos/PosShell";
import { StaffShell, type StaffShellProps } from "@/components/staff/StaffShell";
import type { NavItem, NavModel } from "@/components/staff/navModel";
import type { PosShellData } from "@/app/(ops)/posShellData";
import type { ShellKind, ShellRoleKind } from "@/shell/resolveShell";
import { useResolvedShell } from "@/shell/useShellMode";
import type { OutletTarget } from "./OutletSwitcher";

export type OpsShellProps = {
  children: React.ReactNode;
  outletName: string;
  hotelName: string;
  fullName: string;
  targets: OutletTarget[];
  outletId?: string;
  pos?: PosShellData;
  staff: Omit<StaffShellProps, "children">;
  /** Rol türü ve kayıtlı kabuk tercihi: sunucudan gelir, karar `resolveShell` ile verilir. */
  roleKind: ShellRoleKind;
  /** Server-derived from QS-KAS (a kitchen-only outlet user does not get the POS shell by this rule). */
  canUsePos: boolean;
  preferredShell?: ShellKind | null;
};

const MAX_PRIMARY = 4;

/**
 * A kasa/KDS screen opened in the staff shell (phone width, "bu cihaz kasa değil") has no nav family of its
 * own, so the POS rail (already filtered by permission on the server) becomes the bottom navigation:
 * the first four entries, the rest under "Daha".
 */
function navFromRail(rail: PosRailItem[], screen: string): NavModel {
  const items: NavItem[] = rail.map((item) => ({ id: item.id, label: item.label, icon: item.icon, href: item.href, screen }));
  const primary = items.slice(0, MAX_PRIMARY);
  const more = items.slice(MAX_PRIMARY);
  if (more.length > 0) primary.push({ id: "more", label: "Daha", icon: "menu", href: "", screen: "" });
  return { primary, more };
}

/**
 * The (ops) route group has two shells and this wrapper only picks one (UX T10): `resolveShell` decides from
 * the URL query, the device record, the user preference, the screen's natural context and the window width.
 * Kasa and KDS use the touch POS shell, waiter and room-service screens (and a phone-width kasa) the staff shell.
 * The choice only changes the chrome; the pages and the server-side permission checks are the same.
 */
export function OpsShell({ children, outletName, hotelName, fullName, targets, outletId, pos, staff, roleKind, canUsePos, preferredShell }: OpsShellProps) {
  const path = usePathname();
  const isKasa = path.startsWith("/kasa") && Boolean(pos?.kasa);
  const isKds = path.startsWith("/kds") && Boolean(pos?.kds);
  const decision = useResolvedShell({
    screen: isKds ? { code: "QS-KDS", context: "pos" } : isKasa ? { code: "QS-KAS", context: "pos" } : { code: path, context: "personel" },
    roleKind,
    canUsePos,
    preferred: preferredShell ?? null,
  });

  const rail = isKasa ? pos?.kasa?.rail : isKds ? pos?.kds?.rail : undefined;
  const railNav = useMemo(
    () => (rail && staff.nav.primary.length === 0 ? navFromRail(rail, isKds ? "QS-KDS" : "QS-KAS") : null),
    [rail, staff.nav.primary.length, isKds],
  );

  if (decision.shell === "pos" && isKasa && pos?.kasa) {
    return (
      <PosShell
        context="kasa"
        outletName={outletName}
        hotelName={hotelName}
        fullName={fullName}
        rail={pos.kasa.rail}
        printer={pos.kasa.printer}
        outletId={outletId}
        targets={targets}
        setup={({ start }) => <DeviceSetupPrompt outletId={outletId} start={start} />}
      >
        {children}
      </PosShell>
    );
  }
  if (decision.shell === "pos" && isKds && pos?.kds) {
    return (
      <PosShell
        context="kds"
        outletName={outletName}
        hotelName={hotelName}
        fullName={fullName}
        rail={pos.kds.rail}
        printer={null}
        outletId={outletId}
        targets={targets}
        setup={({ start }) => <DeviceSetupPrompt outletId={outletId} start={start} />}
      >
        {children}
      </PosShell>
    );
  }
  return <StaffShell {...staff} nav={railNav ?? staff.nav}>{children}</StaffShell>;
}
