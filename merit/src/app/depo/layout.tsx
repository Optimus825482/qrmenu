import { FrameOwnBack } from "@/shell/FrameOwnBack";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { StaffShell } from "@/components/staff/StaffShell";
import { loadStaffShellProps, requireStaffLayout } from "@/components/staff/loadShellProps";
import { ConfirmHost } from "@/components/ui/ConfirmHost";
import { SnackbarHost } from "@/components/ui/Snackbar";
import { SessionWatch } from "@/app/kat/SessionWatch";
import { StaffScreensProvider } from "@/components/staff/StaffScreens";
import { visibleScreens } from "@/lib/rbac";
import { pageHotelCtx } from "@/modules/minibar/server/selectedHotel";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { manifest: "/personel.webmanifest" };

/** Every /depo page: the staff shell (rail navigation for the depot roles) and the sheet-style confirm/reason dialogs. */
export default async function DepoLayout({ children }: { children: ReactNode }) {
  const { ctx, path, embedded } = await requireStaffLayout("/depo");
  const shownCtx = await pageHotelCtx(ctx);
  // Links and back targets of the pages follow what the user may view in the hotel on screen.
  const visible = await visibleScreens(shownCtx, shownCtx.session.hotelId);
  if (embedded) {
    return (
      <>
        <ConfirmHost variant="sheet" />
        <SnackbarHost />
        <FrameOwnBack />
        <StaffScreensProvider visible={visible}>{children}</StaffScreensProvider>
      </>
    );
  }
  const shell = await loadStaffShellProps(ctx, path);
  return (
    <>
      <SessionWatch />
      <ConfirmHost variant="sheet" />
      <StaffScreensProvider visible={visible}>
        <StaffShell {...shell}>{children}</StaffShell>
      </StaffScreensProvider>
    </>
  );
}
