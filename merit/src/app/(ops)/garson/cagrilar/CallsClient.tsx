"use client";
import { useCallback, useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { listOpenCallsAction, resolveCallAction } from "@/modules/order/actions/calls";
import { useSse } from "@/shell/useSse";

type Call = { id: string; tableLabel: string; type: string; overdue: boolean };

export default function CallsClient({ outletId, initial }: { outletId: string; initial: Call[] }) {
  const [calls, setCalls] = useState<Call[]>(initial);
  const [pending, start] = useTransition();
  const load = useCallback(async () => {
    const r = await listOpenCallsAction(outletId);
    if (r.ok) setCalls(r.data as Call[]);
  }, [outletId]);
  useSse((e) => {
    if (e.outletId === outletId) void load();
  }, ["call.created", "call.resolved"]);
  return (
    <section data-guide="cagri-listesi" className="space-y-3">
      <h1 className="text-xl font-semibold">Çağrılar</h1>
      {calls.length === 0 ? <p className="text-muted">Açık çağrı yok.</p> : calls.map((call, callIdx) => (
        <article key={call.id} data-guide={callIdx === 0 ? "cagri-al" : undefined} className={`flex items-center justify-between gap-2 rounded-lg border p-3 ${call.overdue ? "border-danger border-2" : "border-border"}`}>
          <span>{call.tableLabel} · {call.type}{call.overdue ? " · gecikti" : ""}</span>
          <Button mutates data-guide={callIdx === 0 ? "cagri-kapat" : undefined} disabled={pending} onClick={() => start(async () => {
            const r = await resolveCallAction(call.id, "YANITLANDI");
            if (r.ok) await load();
          })}>Yanıtla</Button>
        </article>
      ))}
    </section>
  );
}
