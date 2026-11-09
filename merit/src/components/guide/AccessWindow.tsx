"use client";

import { useEffect, useState } from "react";
import { myAccessAction, type MyAccess } from "@/modules/core/server/guideActions";
import type { AppProps } from "@/shell/registry";
import { AccessSummaryView } from "./AccessSummaryView";
import { WelcomeGate } from "./WelcomeGate";

/** XP "Erişimim" window: the summary, plus "Anladım" while it is still unacknowledged. */
export default function AccessWindow({ hotelId, close }: AppProps) {
  const [data, setData] = useState<MyAccess | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [acked, setAcked] = useState(false);

  useEffect(() => {
    let live = true;
    void myAccessAction(hotelId).then((r) => {
      if (!live) return;
      if (r.ok) setData(r.data);
      else setError(r.error.message);
    });
    return () => {
      live = false;
    };
  }, [hotelId]);

  if (error) return <p role="alert" className="p-4 text-sm">{error}</p>;
  if (!data) return <p className="p-4 text-sm">Yükleniyor...</p>;
  return (
    <div className="flex h-full flex-col gap-4 overflow-auto p-4" data-testid="access-window">
      <AccessSummaryView summary={data.summary} mode="self" />
      {data.needsAck && !acked ? (
        <WelcomeGate hash={data.ackHash} onDone={() => { setAcked(true); close(); }} />
      ) : null}
    </div>
  );
}
