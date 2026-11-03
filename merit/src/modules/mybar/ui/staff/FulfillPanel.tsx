"use client";

import { useState } from "react";
import { Icon } from "@/components/icons/Icon";
import { fulfillMybarAction } from "../../server/actions/fulfill";
import type { MybarRow } from "../../server/requests";

type Props = {
  row: MybarRow;
  /** Called after a successful fulfilment; `fullyDelivered` lets the host offer "Kapat". */
  onFulfilled(result: { fullyDelivered: boolean; added: { name: string; qty: number }[] }): void;
  disabled?: boolean;
};

/** Largest quantity the attendant may add for one line: what is still missing, capped by the hotel pool. */
export function maxFor(item: MybarRow["items"][number]): number {
  return Math.max(0, Math.min(item.remainingQty, item.poolRemaining ?? item.remainingQty));
}

/**
 * Per-item delivered quantities, default = requested (still missing). "Tümünü Karşıla" adds everything in one
 * all-or-nothing step; "Seçilenleri Ekle" adds the chosen quantities (partial delivery is allowed).
 */
export function FulfillPanel({ row, onFulfilled, disabled }: Props) {
  const open = row.items.filter((i) => i.remainingQty > 0);
  const [qty, setQty] = useState<Record<string, number>>(() =>
    Object.fromEntries(open.map((i) => [i.productId, maxFor(i)])),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (open.length === 0) return null;

  const chosen = open.filter((i) => (qty[i.productId] ?? 0) > 0);
  const step = (item: MybarRow["items"][number], delta: number) =>
    setQty((prev) => ({
      ...prev,
      [item.productId]: Math.min(maxFor(item), Math.max(0, (prev[item.productId] ?? 0) + delta)),
    }));

  const run = async (input: { all: true } | { lines: { productId: string; qty: number }[] }) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fulfillMybarAction(row.id, input);
      if (!res.ok) {
        setError(res.error.message);
        return;
      }
      onFulfilled(res.data);
    } catch {
      setError("İşlem tamamlanamadı. Bağlantınızı kontrol edip tekrar deneyin.");
    } finally {
      setBusy(false);
    }
  };

  const stepStyle = { minHeight: "var(--tap-action)", minWidth: "var(--tap-action)" } as const;
  return (
    <section aria-label="Odaya eklenecek ürünler" data-testid="fulfill-panel" className="space-y-3">
      <h3 className="text-sm font-semibold text-text">Odaya eklenecekler</h3>
      <ul className="divide-y divide-border rounded-xl border border-border bg-bg">
        {open.map((item) => {
          const max = maxFor(item);
          const value = qty[item.productId] ?? 0;
          const poolEmpty = max === 0;
          return (
            <li key={item.productId} className="flex items-center justify-between gap-3 px-3 py-2" data-testid={`fulfill-line-${item.productId}`}>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-text">{item.name}</p>
                <p className="text-xs text-muted">
                  Kalan {item.remainingQty}
                  {item.poolRemaining !== null ? ` · Havuzda ${item.poolRemaining}` : ""}
                </p>
                {poolEmpty ? <p className="text-xs font-semibold text-danger">Havuzda yok</p> : null}
              </div>
              <div className="flex shrink-0 items-center gap-1" role="group" aria-label={`${item.name} adedi`}>
                <button
                  type="button"
                  aria-label={`${item.name} azalt`}
                  disabled={busy || disabled || value <= 0}
                  onClick={() => step(item, -1)}
                  style={stepStyle}
                  className="inline-flex items-center justify-center rounded-xl border border-border bg-surface text-text disabled:opacity-40"
                >
                  <Icon name="minus" size={18} />
                </button>
                <output aria-live="polite" className="w-8 text-center text-base font-bold tabular-nums text-text">
                  {value}
                </output>
                <button
                  type="button"
                  aria-label={`${item.name} artır`}
                  disabled={busy || disabled || value >= max}
                  onClick={() => step(item, 1)}
                  style={stepStyle}
                  className="inline-flex items-center justify-center rounded-xl border border-border bg-surface text-text disabled:opacity-40"
                >
                  <Icon name="plus" size={18} />
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      {error ? (
        <p role="alert" data-testid="fulfill-error" className="rounded-xl border border-danger/40 bg-danger/10 p-3 text-sm text-danger">
          {error}
        </p>
      ) : null}

      <div className="flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          data-primary=""
          data-mutates=""
          data-guide="tumunu-karsila"
          disabled={busy || disabled}
          onClick={() => void run({ all: true })}
          style={{ minHeight: "var(--tap-primary)" }}
          className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-accent px-4 text-base font-bold text-white disabled:opacity-50"
        >
          <Icon name="check" size={20} />
          Tümünü Karşıla
        </button>
        <button
          type="button"
          data-mutates=""
          disabled={busy || disabled || chosen.length === 0}
          onClick={() => void run({ lines: chosen.map((i) => ({ productId: i.productId, qty: qty[i.productId] ?? 0 })) })}
          style={{ minHeight: "var(--tap-primary)" }}
          className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-border bg-surface px-4 text-base font-semibold text-text disabled:opacity-50"
        >
          Seçilenleri Ekle
        </button>
      </div>
    </section>
  );
}
