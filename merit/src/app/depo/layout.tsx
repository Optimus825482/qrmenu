import type { ReactNode } from "react";
import { ConfirmHost } from "@/components/ui/ConfirmHost";

/** Every /depo page: hosts the sheet-style confirm/reason dialogs (no browser dialogs). */
export default function DepoLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <ConfirmHost variant="sheet" />
      {children}
    </>
  );
}
