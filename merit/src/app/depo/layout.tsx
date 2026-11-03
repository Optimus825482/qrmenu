import type { Metadata } from "next";
import type { ReactNode } from "react";
import { StaffShell } from "@/components/staff/StaffShell";
import { loadStaffShellProps, requireStaffLayout } from "@/components/staff/loadShellProps";
import { ConfirmHost } from "@/components/ui/ConfirmHost";
import { SnackbarHost } from "@/components/ui/Snackbar";
import { SessionWatch } from "@/app/kat/SessionWatch";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { manifest: "/personel.webmanifest" };

/** Every /depo page: the staff shell (rail navigation for the depot roles) and the sheet-style confirm/reason dialogs. */
export default async function DepoLayout({ children }: { children: ReactNode }) {
  const { ctx, path, embedded } = await requireStaffLayout("/depo");
  if (embedded) {
    return (
      <>
        <ConfirmHost variant="sheet" />
        <SnackbarHost />
        {children}
      </>
    );
  }
  const shell = await loadStaffShellProps(ctx, path);
  return (
    <>
      <SessionWatch />
      <ConfirmHost variant="sheet" />
      <StaffShell {...shell}>{children}</StaffShell>
    </>
  );
}
