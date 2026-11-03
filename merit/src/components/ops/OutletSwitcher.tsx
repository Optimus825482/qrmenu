"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { selectTargetAction } from "@/modules/core/server/loginAction";

export type OutletTarget = { index: number; label: string };
export function OutletSwitcher({ targets, className }: { targets: OutletTarget[]; className?: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  if (targets.length < 2) return null;
  return <select aria-label="Outlet değiştir" disabled={pending} className={className ?? "rounded-lg border border-border bg-surface px-2 py-1 text-sm"} defaultValue="" onChange={(event) => {
    const index = Number(event.target.value);
    if (!Number.isInteger(index)) return;
    startTransition(async () => {
      const result = await selectTargetAction(index);
      if (result.ok) router.replace(result.data.next);
    });
  }}>
    <option value="">Outlet değiştir</option>
    {targets.map((target) => <option key={target.index} value={target.index}>{target.label}</option>)}
  </select>;
}
