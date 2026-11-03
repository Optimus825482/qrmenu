"use client";

import { usePathname } from "next/navigation";
import { PosShell } from "@/components/pos/PosShell";
import { StaffShell, type StaffShellProps } from "@/components/staff/StaffShell";
import type { PosShellData } from "@/app/(ops)/posShellData";
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
};

/**
 * The (ops) route group has two shells and this wrapper only picks one by path: kasa and KDS use the
 * touch POS shell, waiter and room-service screens the staff shell (UX T6 / T8).
 */
export function OpsShell({ children, outletName, hotelName, fullName, targets, outletId, pos, staff }: OpsShellProps) {
  const path = usePathname();
  if (path.startsWith("/kasa") && pos?.kasa) {
    return <PosShell context="kasa" outletName={outletName} hotelName={hotelName} fullName={fullName} rail={pos.kasa.rail} printer={pos.kasa.printer} outletId={outletId} targets={targets}>{children}</PosShell>;
  }
  if (path.startsWith("/kds") && pos?.kds) {
    return <PosShell context="kds" outletName={outletName} hotelName={hotelName} fullName={fullName} rail={pos.kds.rail} printer={null} outletId={outletId} targets={targets}>{children}</PosShell>;
  }
  return <StaffShell {...staff}>{children}</StaffShell>;
}
