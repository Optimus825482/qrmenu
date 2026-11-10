"use client";

import type { AppProps } from "@/shell/registry";
import { ManualRoomEntryPanel } from "./controlPanel/ManualRoomEntryPanel";

/**
 * "Elle Oda Girişi" window of the Minibar Takip Yöneticisi: only the manual room entry panel of Denetim Masası,
 * without the rest of the system settings (the role has no CR-SYS). The server authorizes every call
 * (manualRoomEntryAdmin: editor role list and hotel scope).
 */
export function ManualRoomEntryWindow({ setStatus }: AppProps) {
  return (
    <div className="xp-cp-main">
      <ManualRoomEntryPanel setStatus={setStatus} />
    </div>
  );
}
