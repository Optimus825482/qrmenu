"use client";

import { useState } from "react";
import { Icon } from "@/components/icons/Icon";
import { fulfillMybarAction } from "../../server/actions/fulfill";
import type { FulfillInput } from "../../server/fulfill";
import type { MybarRow } from "../../server/requests";

type Named = { name: string; qty: number };
type Props = {
  row: MybarRow;
  /** Called after a successful fulfilment; `fullyDelivered` lets the host offer "Kapat". */
  onFulfilled(result: { fullyDelivered: boolean; added: Named[]; removed?: Named[] }): void;
  disabled?: boolean;
};

type Item = MybarRow["items"][number];
type Removal = MybarRow["removals"][number];

/** Largest quantity the attendant may add for one line: what is still missing, capped by the hotel stock. */
export function maxFor(item: Item): number {
  return Math.max(0, Math.min(item.remainingQty, item.poolRemaining ?? item.remainingQty));
}

type StepperProps = {
  name: string;
  value: number;
  max: number;
  busy: boolean;
  onStep(delta: number): void;
};

function Stepper({ name, value, max, busy, onStep }: StepperProps) {
  const stepStyle = { minHeight: "var(--tap-action)", minWidth: "var(--tap-action)" } as const;
  return (
    <div className="flex shrink-0 items-center gap-1" role="group" aria-label={`${name} adedi`}>
      <button
        type="button"
        aria-label={`${name} azalt`}
        disabled={busy || value <= 0}
        onClick={() => onStep(-1)}
        style={stepStyle}
        className="inline-flex min-h-11 items-center justify-center rounded-xl border border-border bg-surface text-text disabled:opacity-40"
      >
        <Icon name="minus" size={18} />
      </button>
      <output aria-live="polite" className="w-8 text-center text-base font-bold tabular-nums text-text">
        {value}
      </output>
      <button
        type="button"
        aria-label={`${name} artır`}
        disabled={busy || value >= max}
        onClick={() => onStep(1)}
        style={stepStyle}
        className="inline-flex min-h-11 items-center justify-center rounded-xl border border-border bg-surface text-text disabled:opacity-40"
      >
        <Icon name="plus" size={18} />
      </button>
    </div>
  );
}

/**
 * Per-product quantities for both halves of a swap, default = what is still open. "Odadan alınanlar" is how many
 * of a setup product the attendant took out of the room (it goes back to the hotel stock), "Odaya eklenecekler"
 * how many were put in. "Tümünü Karşıla" does both lists in one all-or-nothing step; the save button sends the
 * chosen quantities of both lists together (partial work is allowed).
 */
export function FulfillPanel({ row, onFulfilled, disabled }: Props) {
  const open = row.items.filter((i) => i.remainingQty > 0);
  const openRemovals = row.removals.filter((i) => i.remainingQty > 0);
  const [qty, setQty] = useState<Record<string, number>>(() =>
    Object.fromEntries(open.map((i) => [i.productId, maxFor(i)])),
  );
  const [taken, setTaken] = useState<Record<string, number>>(() =>
    Object.fromEntries(openRemovals.map((i) => [i.productId, i.remainingQty])),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (open.length === 0 && openRemovals.length === 0) return null;

  const chosen = open.filter((i) => (qty[i.productId] ?? 0) > 0);
  const chosenRemovals = openRemovals.filter((i) => (taken[i.productId] ?? 0) > 0);
  const step = (item: Item, delta: number) =>
    setQty((prev) => ({
      ...prev,
      [item.productId]: Math.min(maxFor(item), Math.max(0, (prev[item.productId] ?? 0) + delta)),
    }));
  const stepTaken = (item: Removal, delta: number) =>
    setTaken((prev) => ({
      ...prev,
      [item.productId]: Math.min(item.remainingQty, Math.max(0, (prev[item.productId] ?? 0) + delta)),
    }));

  const run = async (input: FulfillInput) => {
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

  const save = () => {
    const input: { lines?: { productId: string; qty: number }[]; removed?: { productId: string; qty: number }[] } = {};
    if (chosen.length > 0) input.lines = chosen.map((i) => ({ productId: i.productId, qty: qty[i.productId] ?? 0 }));
    if (chosenRemovals.length > 0) {
      input.removed = chosenRemovals.map((i) => ({ productId: i.productId, qty: taken[i.productId] ?? 0 }));
    }
    void run(input);
  };

  const locked = busy || Boolean(disabled);
  const listClass = "divide-y divide-border overflow-hidden rounded-xl border border-border bg-bg";
  const lineClass = "flex min-h-11 items-center justify-between gap-3 px-3 py-2 odd:bg-surface even:bg-bg";
  return (
    <section aria-label="Odaya eklenecek ürünler" data-testid="fulfill-panel" className="space-y-4">
      {openRemovals.length > 0 ? (
        <div className="space-y-2" data-testid="fulfill-removals">
          <h3 className="text-sm font-semibold text-text">Odadan alınanlar</h3>
          <ul className={listClass} aria-label="Odadan alınacak adetler">
            {openRemovals.map((item) => (
              <li key={item.productId} className={lineClass} data-testid={`fulfill-removal-${item.productId}`}>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-text">{item.name}</p>
                  <p className="text-xs text-muted">Kalan {item.remainingQty} · otel deposuna iade edilir</p>
                </div>
                <Stepper
                  name={`${item.name} alınan`}
                  value={taken[item.productId] ?? 0}
                  max={item.remainingQty}
                  busy={locked}
                  onStep={(d) => stepTaken(item, d)}
                />
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {open.length > 0 ? (
        <div className="space-y-2" data-testid="fulfill-additions">
          <h3 className="text-sm font-semibold text-text">Odaya eklenecekler</h3>
          <ul className={listClass} aria-label="Odaya eklenecek adetler">
            {open.map((item) => {
              const max = maxFor(item);
              return (
                <li key={item.productId} className={lineClass} data-testid={`fulfill-line-${item.productId}`}>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-text">{item.name}</p>
                    <p className="text-xs text-muted">
                      Kalan {item.remainingQty}
                      {item.poolRemaining !== null ? ` · Otel deposunda ${item.poolRemaining}` : ""}
                    </p>
                    {max === 0 ? <p className="text-xs font-semibold text-danger">Depoda yok</p> : null}
                  </div>
                  <Stepper
                    name={item.name}
                    value={qty[item.productId] ?? 0}
                    max={max}
                    busy={locked}
                    onStep={(d) => step(item, d)}
                  />
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

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
          disabled={locked}
          onClick={() => void run({ all: true })}
          style={{ minHeight: "var(--tap-primary)" }}
          className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-accent px-4 text-base font-bold text-white disabled:opacity-50"
        >
          <Icon name="check" size={20} />
          Tümünü Karşıla
        </button>
        <button
          type="button"
          data-mutates=""
          disabled={locked || chosen.length + chosenRemovals.length === 0}
          onClick={save}
          style={{ minHeight: "var(--tap-primary)" }}
          className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-border bg-surface px-4 text-base font-semibold text-text disabled:opacity-50"
        >
          {openRemovals.length > 0 ? "Seçilenleri Kaydet" : "Seçilenleri Ekle"}
        </button>
      </div>
    </section>
  );
}
