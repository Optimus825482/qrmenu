import type { Metadata } from "next";
import type { ReactNode } from "react";
import { StaffShell } from "@/components/staff/StaffShell";
import { loadStaffShellProps, requireStaffLayout } from "@/components/staff/loadShellProps";
import { ConfirmHost } from "@/components/ui/ConfirmHost";
import { PersistentMybarModal } from "@/app/kat/components/PersistentMybarModal";
import { SnackbarHost } from "@/components/ui/Snackbar";
import { SessionWatch } from "./SessionWatch";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { manifest: "/personel.webmanifest" };

/**
 * Every /kat page: the staff shell (top bar, the single bottom navigation, session strips) wraps the page;
 * the section layouts below guard the screens, this one watches the session and builds the navigation
 * from the session's current hotel.
 */
export default async function KatLayout({ children }: { children: ReactNode }) {
  const { ctx, path, embedded } = await requireStaffLayout("/kat");
  if (embedded) {
    return (
      <>
        <SessionWatch />
        <ConfirmHost variant="sheet" />
        <SnackbarHost />
        <PersistentMybarModal />
        {children}
      </>
    );
  }
  const shell = await loadStaffShellProps(ctx, path);
  return (
    <>
      <SessionWatch />
      <ConfirmHost variant="sheet" />
      <PersistentMybarModal />
      <StaffShell {...shell}>{children}</StaffShell>
    </>
  );
}
