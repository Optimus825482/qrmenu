"use client";

import { useSse } from "@/shell/useSse";

export function LiveBadge() {
  const { status } = useSse(() => {}, []);
  const offline = status !== "open";
  return <span className={offline ? "rounded-full bg-amber-100 px-2 py-1 text-xs font-medium text-amber-800" : "rounded-full bg-emerald-100 px-2 py-1 text-xs font-medium text-emerald-800"}>{offline ? "çevrimdışı" : "canlı"}</span>;
}
