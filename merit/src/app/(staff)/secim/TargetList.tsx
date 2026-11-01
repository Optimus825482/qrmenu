"use client";

import { useRouter } from "next/navigation";
import { useActionState } from "react";
import { useHydrated } from "@/components/useHydrated";
import { HotelLogo } from "@/components/HotelLogo";
import { selectTargetAction } from "@/modules/core/server/loginAction";

export type TargetCard = { index: number; hotelName: string; hotelCode: string; label: string; roleName: string };

type PickState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "done" };

export function TargetList({ targets }: { targets: TargetCard[] }) {
  const router = useRouter();
  const hydrated = useHydrated();

  const [state, pick, pending] = useActionState(
    async (_prev: PickState, formData: FormData): Promise<PickState> => {
      const result = await selectTargetAction(Number(formData.get("targetIndex")));
      if (!result.ok) return { status: "error", message: result.error.message };
      // Navigate from inside the action: the action rewrites the session cookie, so Next re-renders
      // /secim and this component may be unmounted before an effect could ever run.
      router.replace(result.data.next);
      return { status: "done" };
    },
    { status: "idle" },
  );

  const busy = pending || state.status === "done";

  return (
    <form action={pick} className="flex flex-col gap-3" aria-busy={busy}>
      {state.status === "error" && (
        <p
          role="alert"
          className="rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger"
        >
          {state.message}
        </p>
      )}
      {targets.map((t) => (
        <button
          key={t.index}
          type="submit"
          name="targetIndex"
          value={t.index}
          disabled={!hydrated || busy}
          className="flex min-h-14 items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3 text-left transition-colors hover:border-accent hover:bg-bg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-60"
        >
          <HotelLogo hotelCode={t.hotelCode} size={52} />
          <span className="flex flex-col items-start gap-0.5">
            <span className="text-xs font-medium uppercase tracking-wide text-gold">{t.hotelName}</span>
            <span className="text-base font-semibold text-text">{t.label}</span>
            <span className="text-sm text-muted">{t.roleName}</span>
          </span>
        </button>
      ))}
    </form>
  );
}
