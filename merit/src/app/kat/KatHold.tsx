"use client";

import { useSse } from "@/shell/useSse";

/** Subscribes to the tab SSE stream. `session.closed` is handled by the store (→ /giris). */
export function KatHold() {
  useSse(() => {});
  return (
    <main className="p-6">
      <h1>Kat planı</h1>
    </main>
  );
}
