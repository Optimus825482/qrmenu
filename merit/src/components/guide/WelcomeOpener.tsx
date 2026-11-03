"use client";

import { useEffect } from "react";
import { windowStore } from "@/shell/windowStore";

/** Opens the "Erişimim" window once per page load while the summary is unacknowledged (XP desktop). */
export function WelcomeOpener({ needed, hotelId }: { needed: boolean; hotelId: string }) {
  useEffect(() => {
    if (!needed) return;
    const store = windowStore.getState();
    if (!store.ready) return;
    const already = Object.values(store.windows).some((w) => w.appId === "core.erisimim");
    if (!already) store.open("core.erisimim", { hotelId });
  }, [needed, hotelId]);
  return null;
}
