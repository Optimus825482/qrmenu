"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/icons/Icon";
import { useDialogFocus } from "@/components/ui/useDialogFocus";
import { LiveStatusWidget } from "@/shell/components/widgets/LiveStatusWidget";
// The table and its row dialogs are drawn with the desktop widget's styles (all scoped to .xp-* classes).
import "@/shell/theme.css";

/**
 * "Anlık Durum" in the personel/tablet shell: a top-bar (or left menu) button that opens the desktop widget's table
 * in a sheet. Shown only to users whose role or own permissions include CR-DUR (loadStaffShellProps).
 * `screens` = the screens the user may view in the current hotel, which pick the rows the table may show.
 */
export function LiveStatusButton({ screens }: { screens: readonly string[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className="staff-icon-button"
        aria-label="Anlık Durum"
        title="Anlık Durum"
        aria-haspopup="dialog"
        aria-expanded={open}
        data-testid="anlik-durum-button"
        onClick={() => setOpen(true)}
      >
        <Icon name="chart" size={24} />
      </button>
      {open ? <LiveStatusSheet screens={screens} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function LiveStatusSheet({ screens, onClose }: { screens: readonly string[]; onClose: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  useDialogFocus(box, onClose, () => closeRef.current);
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);
  return (
    <div className="staff-sheet-backdrop" onPointerDown={(event) => event.target === event.currentTarget && onClose()}>
      <div ref={box} role="dialog" aria-modal="true" aria-label="Anlık Durum" className="staff-sheet staff-live-sheet">
        <div className="staff-live-head">
          <h2>Anlık Durum</h2>
          <button ref={closeRef} type="button" className="staff-menu-item" style={{ width: "auto" }} onClick={onClose}>
            Kapat
          </button>
        </div>
        {/* Wide tables (several hotels) scroll sideways inside the sheet, never the page. */}
        <div className="staff-live-scroll" data-testid="anlik-durum-panel">
          <LiveStatusWidget screens={screens} />
        </div>
      </div>
    </div>
  );
}
