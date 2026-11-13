import { FrameOwnBack } from "@/shell/FrameOwnBack";
import { pageHotelCtx } from "@/modules/minibar/server/selectedHotel";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { StaffShell } from "@/components/staff/StaffShell";
import { loadStaffShellProps, requireStaffLayout } from "@/components/staff/loadShellProps";
import { ConfirmHost } from "@/components/ui/ConfirmHost";
import { PersistentMybarModal } from "@/app/kat/components/PersistentMybarModal";
import { SnackbarHost } from "@/components/ui/Snackbar";
import { SessionWatch } from "./SessionWatch";
import { StaffScreensProvider } from "@/components/staff/StaffScreens";
import { visibleScreens } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { manifest: "/personel.webmanifest" };

/**
 * Every /kat page: the staff shell (top bar, the single bottom navigation, session strips) wraps the page;
 * the section layouts below guard the screens, this one watches the session and builds the navigation
 * from the session's current hotel.
 */
export default async function KatLayout({ children }: { children: ReactNode }) {
  const { ctx, path, embedded } = await requireStaffLayout("/kat");
  // The MyBar alerts follow the hotel the window shows, not the session's.
  const shownCtx = await pageHotelCtx(ctx);
  const shownHotelId = shownCtx.session.hotelId;
  // Links and back targets of the pages follow what the user may view in the hotel on screen.
  const visible = await visibleScreens(shownCtx, shownHotelId);
  if (embedded) {
    return (
      <>
        <SessionWatch />
        <ConfirmHost variant="sheet" />
        <SnackbarHost />
        <FrameOwnBack />
        <StaffScreensProvider visible={visible}>
          <PersistentMybarModal hotelId={shownHotelId} />
          {children}
        </StaffScreensProvider>
      </>
    );
  }
  const shell = await loadStaffShellProps(ctx, path);
  return (
    <>
      <SessionWatch />
      <ConfirmHost variant="sheet" />
      <StaffScreensProvider visible={visible}>
        <PersistentMybarModal hotelId={shownHotelId} />
        <StaffShell {...shell}>{children}</StaffShell>
      </StaffScreensProvider>
    </>
  );
}
