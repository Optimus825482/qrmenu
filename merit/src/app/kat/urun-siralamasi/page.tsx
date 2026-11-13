"use client";

import { mbFetch } from "@/modules/minibar/ui/mbFetch";
import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { Icon } from "@/components/icons/Icon";
import { BackLink } from "@/components/staff/BackLink";
import { confirm } from "@/shell/confirm";
import { notify } from "@/shell/notify";
import { useLeaveGuard } from "@/shell/useLeaveGuard";

type Row = { productId: string; name: string; groupName: string };
type View = { products: Row[]; standard: string[]; custom: boolean };

/** Distance from the top/bottom edge of the screen at which a drag starts scrolling the list. */
const EDGE = 72;

/** The element that actually scrolls the page under the staff shell (the document when nothing else does). */
function scrollParent(from: HTMLElement | null): HTMLElement {
  for (let el = from?.parentElement; el; el = el.parentElement) {
    const overflow = getComputedStyle(el).overflowY;
    if ((overflow === "auto" || overflow === "scroll") && el.scrollHeight > el.clientHeight) return el;
  }
  return (document.scrollingElement as HTMLElement | null) ?? document.documentElement;
}

function move<T>(list: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || to >= list.length) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/**
 * Oda kontrol ürün sıralaması: the attendant drags the product cards into the order they walk the minibar.
 * The order is personal and is used by the room check and manual entry screens until they save another one.
 */
export default function UrunSiralamasiPage() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [saved, setSaved] = useState<string[]>([]);
  const [standard, setStandard] = useState<string[]>([]);
  const [custom, setCustom] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const board = useRef<HTMLOListElement>(null);
  const scroller = useRef<HTMLElement | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await mbFetch("/api/minibar/product-order");
      const json = (await res.json()) as View & { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Ürünler yüklenemedi.");
      setRows(json.products);
      setSaved(json.products.map((row) => row.productId));
      setStandard(json.standard);
      setCustom(json.custom);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ürünler yüklenemedi.");
    }
  }, []);

  useEffect(() => {
    const first = setTimeout(() => void load(), 0);
    return () => clearTimeout(first);
  }, [load]);

  const ids = rows?.map((row) => row.productId) ?? [];
  const dirty = ids.join("|") !== saved.join("|");
  const isStandard = ids.join("|") === standard.join("|");
  // A moved card not saved yet: leaving asks first (D4).
  const guard = useLeaveGuard(dirty);

  const onPointerDown = (event: PointerEvent<HTMLButtonElement>, id: string) => {
    if (busy || (event.pointerType === "mouse" && event.button !== 0)) return;
    // No text selection and no native drag: the card is moved by the listeners below.
    event.preventDefault();
    scroller.current = scrollParent(board.current);
    setDragId(id);
  };

  // While a card is held, the pointer is followed on the window: reordering moves the card's own element in
  // the page, so listeners (or a pointer capture) on the handle itself would lose the gesture.
  useEffect(() => {
    if (!dragId) return;
    const onMove = (event: globalThis.PointerEvent) => {
      if (event.clientY < EDGE) scroller.current?.scrollBy(0, -14);
      else if (event.clientY > window.innerHeight - EDGE) scroller.current?.scrollBy(0, 14);
      const over = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-order-id]");
      const overId = over?.dataset.orderId;
      if (!overId || overId === dragId) return;
      setRows((current) => {
        if (!current) return current;
        return move(
          current,
          current.findIndex((row) => row.productId === dragId),
          current.findIndex((row) => row.productId === overId),
        );
      });
    };
    const end = () => setDragId(null);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
    };
  }, [dragId]);

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const step = event.key === "ArrowUp" || event.key === "ArrowLeft" ? -1 : event.key === "ArrowDown" || event.key === "ArrowRight" ? 1 : 0;
    if (step === 0) return;
    event.preventDefault();
    setRows((current) => (current ? move(current, index, index + step) : current));
  };

  const save = async () => {
    if (!rows || busy) return;
    setBusy(true);
    try {
      const res = await mbFetch("/api/minibar/product-order", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productIds: rows.map((row) => row.productId) }),
      });
      const json = (await res.json()) as { message?: string; error?: string };
      if (!res.ok) throw new Error(json.error ?? "Sıralama kaydedilemedi.");
      setSaved(rows.map((row) => row.productId));
      setCustom(true);
      notify.success(json.message ?? "Ürün sıralamanız kaydedildi.");
    } catch (e) {
      notify.error(e instanceof Error ? e.message : "Sıralama kaydedilemedi.");
    } finally {
      setBusy(false);
    }
  };

  const reset = async () => {
    if (busy) return;
    const ok = await confirm({
      title: "Standart sıraya dön",
      message: "Kendi sıralamanız silinir; ürünler herkesin gördüğü standart sırayla gösterilir.",
      confirmLabel: "Standart sıraya dön",
      cancelLabel: "Vazgeç",
      // Deletes the user's own order: asked always (a simple question answers itself on the staff pages).
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      const res = await mbFetch("/api/minibar/product-order", { method: "DELETE" });
      const json = (await res.json()) as { message?: string; error?: string };
      if (!res.ok) throw new Error(json.error ?? "Standart sıraya dönülemedi.");
      notify.success(json.message ?? "Standart ürün sıralamasına dönüldü.");
      await load();
    } catch (e) {
      notify.error(e instanceof Error ? e.message : "Standart sıraya dönülemedi.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-bg pb-32 text-text">
      <header className="sticky top-[var(--staff-head-h,0px)] z-20 border-b border-border bg-bg px-4 py-3">
        <div className="mx-auto flex max-w-5xl items-center gap-3">
          <BackLink guard={guard} />
          <div className="min-w-0">
            <h1 className="text-lg font-bold">Oda Kontrol Ürün Sıralaması</h1>
            <p className="text-xs text-muted">
              {custom ? "Kendi sıralamanızı kullanıyorsunuz." : "Standart sıralamayı kullanıyorsunuz."} Bu sıra yalnız sizin
              ekranınızı değiştirir.
            </p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-4 px-4 py-5">
        <p className="rounded-xl border border-border bg-surface p-3 text-sm text-text">
          Ürün kartını soldaki tutamaçtan (<span aria-hidden="true">⋮⋮</span>) tutup istediğiniz yere sürükleyin, sonra{" "}
          <strong>Kaydet</strong>e basın. Oda kontrol ekranında ürünler bu sırayla gösterilir.
        </p>

        {error ? (
          <div role="alert" className="rounded-2xl border border-danger/40 bg-danger/10 p-5 text-sm text-danger">
            {error}
          </div>
        ) : rows === null ? (
          <div className="rounded-2xl border border-border bg-surface p-10 text-center text-sm text-muted">Ürünler yükleniyor...</div>
        ) : rows.length === 0 ? (
          <div className="rounded-2xl border border-border bg-surface p-10 text-center text-sm text-muted">
            Bu otelde oda minibarına tanımlı ürün yok.
          </div>
        ) : (
          <ol
            ref={board}
            data-testid="order-board"
            aria-label="Ürün sırası"
            className="grid grid-cols-1 gap-2.5 rounded-2xl border-2 border-dashed border-border bg-surface p-3 sm:grid-cols-2 lg:grid-cols-3"
          >
            {rows.map((row, index) => {
              const dragging = dragId === row.productId;
              return (
                <li
                  key={row.productId}
                  data-order-id={row.productId}
                  data-testid={`order-card-${row.name}`}
                  className={`flex items-stretch overflow-hidden rounded-xl border bg-bg transition-shadow ${
                    dragging ? "border-accent shadow-lg ring-2 ring-accent" : "border-border"
                  }`}
                >
                  <button
                    type="button"
                    aria-label={`${row.name}: ${index + 1}. sırada. Sürükleyin ya da ok tuşlarıyla taşıyın`}
                    onPointerDown={(event) => onPointerDown(event, row.productId)}
                    draggable={false}
                    onKeyDown={(event) => onKeyDown(event, index)}
                    style={{ touchAction: "none", minWidth: 56, minHeight: 60, cursor: dragging ? "grabbing" : "grab" }}
                    className={`flex select-none items-center justify-center border-r text-xl font-bold leading-none ${
                      dragging ? "border-accent bg-accent text-white" : "border-border bg-surface text-muted"
                    }`}
                  >
                    <span aria-hidden="true">⋮⋮</span>
                  </button>
                  <div className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2">
                    <span className="inline-flex h-8 min-w-8 items-center justify-center rounded-full bg-accent px-2 text-sm font-bold tabular-nums text-white">
                      {index + 1}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-text">{row.name}</p>
                      <p className="text-xs text-muted">{row.groupName}</p>
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </main>

      {rows && rows.length > 0 ? (
        <div className="staff-action-bar fixed inset-x-0 bottom-0 z-30 border-t border-border bg-bg p-3">
          <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => void reset()}
              disabled={busy || (!custom && isStandard)}
              style={{ minHeight: "var(--tap-primary)" }}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-border bg-surface px-4 py-3 text-xs font-semibold text-text hover:bg-bg disabled:opacity-40"
            >
              <Icon name="undo" size={18} />
              Standart sıraya dön
            </button>
            <button
              type="button"
              data-primary=""
              onClick={() => void save()}
              disabled={busy || !dirty}
              style={{ minHeight: "var(--tap-primary)" }}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-accent px-6 py-3 text-sm font-bold text-white hover:opacity-95 disabled:opacity-50 sm:flex-initial"
            >
              <Icon name="check" size={20} />
              {busy ? "Kaydediliyor..." : dirty ? "Kaydet" : "Kaydedildi"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
