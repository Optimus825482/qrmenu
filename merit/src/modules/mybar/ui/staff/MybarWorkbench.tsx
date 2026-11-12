"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { MeritEvent } from "@/lib/realtime-events";
import { confirm } from "@/shell/confirm";
import { notify } from "@/shell/notify";
import { useSse } from "@/shell/useSse";
import { getMybarCapsAction } from "../../server/actions/caps";
import { acknowledgeMybarAction, completeMybarAction, getMybarAction } from "../../server/actions/requests";
import type { MybarRow } from "../../server/requests";
import { CancelDialog } from "./CancelDialog";
import { CloseDialog } from "./CloseDialog";
import { FulfillPanel } from "./FulfillPanel";
import { MybarDetail } from "./MybarDetail";

const LIVE = ["mybar.seen", "mybar.fulfilled", "mybar.completed", "mybar.cancelled", "realtime.resync"] as const;

type Props = {
  requestId: string;
  /** Known by the server page; the room card leaves it out and it is read once. */
  canCancel?: boolean;
  /** A write happened (fulfilled / closed / cancelled): hosts refresh their own data. */
  onChanged?(): void;
};

/** One request opened for work: details, per-item fulfilment, close and (only with the right) cancel. */
export function MybarWorkbench({ requestId, canCancel, onChanged }: Props) {
  const [row, setRow] = useState<MybarRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [caps, setCaps] = useState<{ canAct: boolean; canCancel: boolean } | null>(null);
  const [dialog, setDialog] = useState<"close" | "cancel" | null>(null);
  const [busy, setBusy] = useState(false);
  const alive = useRef(true);

  const load = useCallback(async () => {
    const res = await getMybarAction(requestId).catch(() => null);
    if (!alive.current) return;
    if (!res) setError("Talep yüklenemedi.");
    else if (!res.ok) setError(res.error.message);
    else {
      setError(null);
      setRow(res.data);
    }
  }, [requestId]);

  useEffect(() => {
    alive.current = true;
    const t = setTimeout(() => void load(), 0);
    return () => {
      alive.current = false;
      clearTimeout(t);
    };
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    void getMybarCapsAction().then((res) => {
      if (!cancelled && res.ok) setCaps(res.data);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useSse((e: MeritEvent) => {
    const id = (e.payload as { requestId?: string } | undefined)?.requestId;
    if (e.type === "realtime.resync" || id === requestId) void load();
  }, LIVE);

  if (error && !row) return <p role="alert" className="text-sm text-danger">{error}</p>;
  if (!row) return <p className="text-sm text-muted" aria-busy="true">Yükleniyor...</p>;

  const waiting = row.status === "BEKLEMEDE";
  const mayAct = caps?.canAct ?? false;
  const mayCancel = canCancel ?? caps?.canCancel ?? false;
  const missing = row.items.some((i) => i.remainingQty > 0) || row.removals.some((i) => i.remainingQty > 0);

  const changed = async () => {
    setDialog(null);
    await load();
    onChanged?.();
  };

  const acknowledge = async () => {
    setBusy(true);
    const res = await acknowledgeMybarAction(row.id).catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      notify.error(res ? res.error.message : "Onaylanamadı.");
      return;
    }
    await changed();
  };

  const close = async () => {
    if (missing) {
      setDialog("close");
      return;
    }
    const yes = await confirm({
      title: `Oda ${row.roomNumber} talebi kapatılsın mı?`,
      message: "Talepteki tüm ürünler karşılandı. Talep tamamlandı olarak işaretlenir.",
      confirmLabel: "Kapat",
      cancelLabel: "Vazgeç",
      danger: true,
    });
    if (!yes) return;
    setBusy(true);
    const res = await completeMybarAction(row.id, {}).catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      notify.error(res ? res.error.message : "Talep kapatılamadı.");
      return;
    }
    notify.success(`Oda ${row.roomNumber} talebi tamamlandı.`);
    await changed();
  };

  return (
    <div className="space-y-4">
      <MybarDetail row={row} />

      {waiting && mayAct ? (
        <>
          {!row.seenAt ? (
            <button
              type="button"
              data-mutates=""
              disabled={busy}
              onClick={() => void acknowledge()}
              style={{ minHeight: "var(--tap-action)" }}
              className="w-full rounded-xl border border-border bg-surface px-4 text-sm font-semibold text-text disabled:opacity-50"
            >
              Gördüm
            </button>
          ) : null}
          <FulfillPanel
            key={`${row.items.map((i) => `${i.remainingQty}:${i.poolRemaining ?? "-"}`).join("-")}|${row.removals.map((i) => i.remainingQty).join("-")}`}
            row={row}
            onFulfilled={(r) => {
              const parts = [
                r.removed && r.removed.length > 0 ? `alınan: ${r.removed.map((a) => `${a.name} ${a.qty}`).join(", ")}` : "",
                r.added.length > 0 ? `eklenen: ${r.added.map((a) => `${a.name} ${a.qty}`).join(", ")}` : "",
              ].filter(Boolean);
              notify.success(`Oda ${row.roomNumber}: ${parts.join(" · ")}.`);
              void changed();
            }}
          />
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              data-mutates=""
              data-guide="talebi-kapat"
              disabled={busy}
              onClick={() => void close()}
              style={{ minHeight: "var(--tap-primary)" }}
              className={`flex-1 rounded-xl px-4 text-base font-bold disabled:opacity-50 ${
                missing ? "border border-border bg-surface text-text" : "bg-accent text-white"
              }`}
            >
              {missing ? "Eksiklerle Kapat" : "Talebi Kapat"}
            </button>
            {mayCancel ? (
              <button
                type="button"
                data-mutates=""
                data-testid="cancel-request"
                disabled={busy}
                onClick={() => setDialog("cancel")}
                style={{ minHeight: "var(--tap-action)" }}
                className="rounded-xl border border-danger/50 bg-surface px-4 text-sm font-semibold text-danger disabled:opacity-50"
              >
                İptal Et
              </button>
            ) : null}
          </div>
        </>
      ) : null}

      {dialog === "close" ? <CloseDialog row={row} onCancel={() => setDialog(null)} onClosed={() => void changed()} /> : null}
      {dialog === "cancel" && mayCancel ? (
        <CancelDialog row={row} onCancel={() => setDialog(null)} onCancelled={() => void changed()} />
      ) : null}
    </div>
  );
}
