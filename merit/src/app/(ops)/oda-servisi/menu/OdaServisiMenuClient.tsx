"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/icons/Icon";
import { useDialogFocus } from "@/components/ui/useDialogFocus";
import { formatPrice } from "@/lib/formatPrice";
import { listMenuTreeAction, setMenuAvailabilityAction } from "@/modules/menu/server/actions/menuTree";
import type { MenuTreeNode } from "@/modules/menu/server/menuTree";
import { useSse } from "@/shell/useSse";
import { branchIds, buildBranches, findItem, type MenuBranch, pathOf } from "./menuView";

/** Menu edits and sold-out flips of this outlet, whoever made them. */
const LIVE_EVENTS = ["menu.changed", "menu.availability", "price.display", "realtime.resync"] as const;
const REFRESH_DEBOUNCE_MS = 200;
const CONN_ERROR = "Bağlantı hatası: işlem gönderilemedi. Tekrar deneyin.";

type Props = {
  outletId: string;
  hotelName: string;
  initialNodes: MenuTreeNode[] | null;
  loadError?: string | null;
  /** RO-TAL "D", computed on the server: may mark an item sold out and put it back. */
  canEdit: boolean;
};

export default function OdaServisiMenuClient({ outletId, hotelName, initialNodes, loadError, canEdit }: Props) {
  const [nodes, setNodes] = useState<MenuTreeNode[] | null>(initialNodes);
  const [error, setError] = useState(loadError ?? "");
  const [query, setQuery] = useState("");
  const [soldOutOnly, setSoldOutOnly] = useState(false);
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  const [itemId, setItemId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await listMenuTreeAction({ outletId });
      if (res.ok) {
        setNodes(res.data);
        setError("");
      } else {
        setError(res.error.message);
      }
    } catch {
      setError("Bağlantı hatası: menü yenilenemedi.");
    }
  }, [outletId]);

  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const { status } = useSse((event) => {
    if (event.type !== "realtime.resync" && event.outletId !== outletId) return;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void refresh(), REFRESH_DEBOUNCE_MS);
  }, LIVE_EVENTS);

  // A tablet that slept may have missed events: refetch when it is back.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [refresh]);

  const filtering = query.trim() !== "" || soldOutOnly;
  const branches = useMemo(() => buildBranches(nodes ?? [], { query, soldOutOnly }), [nodes, query, soldOutOnly]);
  const totals = useMemo(() => {
    const all = buildBranches(nodes ?? [], { query: "", soldOutOnly: false });
    return {
      items: all.reduce((sum, b) => sum + b.itemCount, 0),
      soldOut: all.reduce((sum, b) => sum + b.soldOutCount, 0),
      ids: branchIds(all),
    };
  }, [nodes]);
  // A filtered tree is shown fully open: the matches are what the user is looking for.
  const isOpen = (id: string) => filtering || open.has(id);
  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const item = itemId && nodes ? findItem(nodes, itemId) : undefined;

  const setAvailable = async (target: MenuTreeNode, available: boolean) => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await setMenuAvailabilityAction({ nodeId: target.id, available });
      if (res.ok) {
        setError("");
        setItemId(null);
      } else {
        setError(res.error.message);
      }
      await refresh();
    } catch {
      setError(CONN_ERROR);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-label="Oda servisi menüsü" className="space-y-4">
      <div className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="flex flex-wrap items-center gap-2 text-xl font-black tracking-tight text-text">
              <Icon name="utensils" size={20} />
              <span>Oda Servisi Menüsü</span>
              <span className="rounded-full border border-accent px-2 py-0.5 text-[13px] font-bold text-accent">{hotelName}</span>
            </h1>
            {status !== "open" ? (
              <p role="status" className="mt-0.5 text-[13px] text-warn">
                Canlı bağlantı yok, menü sayfa açıldığındaki hâliyle gösteriliyor
              </p>
            ) : null}
          </div>
          <p className="flex flex-wrap items-center gap-2 text-[13px] font-bold" data-testid="menu-totals">
            <span className="rounded-full bg-surface-sunken px-3 py-1 text-text">{`${totals.items} ürün`}</span>
            <span
              className={`rounded-full border px-3 py-1 ${totals.soldOut > 0 ? "border-danger/40 bg-danger/10 text-danger" : "border-border text-muted"}`}
            >
              {`${totals.soldOut} tükendi`}
            </span>
          </p>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <label className="flex min-w-48 flex-1 flex-col gap-1 text-[13px] font-semibold text-muted">
            <span>Ürün ara</span>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Ürün adı"
              autoComplete="off"
              className="min-h-11 rounded-xl border border-border bg-surface px-3 text-base font-bold text-text"
            />
          </label>
          <button
            type="button"
            aria-pressed={soldOutOnly}
            onClick={() => setSoldOutOnly((v) => !v)}
            className={`mt-auto min-h-11 rounded-xl border px-4 text-sm font-black ${
              soldOutOnly ? "border-danger bg-danger text-white" : "border-border bg-surface text-text"
            }`}
          >
            Yalnız tükenenler
          </button>
          {!filtering ? (
            <button
              type="button"
              onClick={() => setOpen(open.size > 0 ? new Set() : new Set(totals.ids))}
              className="mt-auto min-h-11 rounded-xl border border-border bg-surface px-4 text-sm font-bold text-text"
            >
              {open.size > 0 ? "Tümünü kapat" : "Tümünü aç"}
            </button>
          ) : null}
        </div>
      </div>

      {error ? (
        <div role="alert" className="flex items-center justify-between rounded-xl border border-danger/30 bg-danger/10 p-3 text-sm font-semibold text-danger">
          <span>{error}</span>
          <button type="button" onClick={() => setError("")} className="min-h-11 min-w-11 px-2 text-[13px] underline">
            Kapat
          </button>
        </div>
      ) : null}

      {nodes && branches.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border p-6 text-center text-[13px] text-muted">
          {soldOutOnly && query.trim() === ""
            ? "Tükendi olarak işaretlenmiş ürün yok."
            : filtering
              ? "Aramaya uyan ürün yok."
              : "Bu otelin oda servisi menüsünde ürün tanımlanmamış."}
        </p>
      ) : null}

      <ul className="space-y-2" data-testid="menu-tree">
        {branches.map((branch) => (
          <Branch key={branch.id} branch={branch} depth={0} isOpen={isOpen} onToggle={toggle} onOpenItem={setItemId} />
        ))}
      </ul>

      {item && nodes ? (
        <ItemDialog
          item={item}
          path={pathOf(nodes, item.id) ?? ""}
          canEdit={canEdit}
          busy={busy}
          onClose={() => setItemId(null)}
          onSet={(available) => void setAvailable(item, available)}
        />
      ) : null}
    </section>
  );
}

function SoldOutBadge() {
  return <span className="shrink-0 rounded-full border border-danger/40 bg-danger/10 px-2 py-0.5 text-[13px] font-black text-danger">Tükendi</span>;
}

function Branch({
  branch,
  depth,
  isOpen,
  onToggle,
  onOpenItem,
}: {
  branch: MenuBranch;
  depth: number;
  isOpen(id: string): boolean;
  onToggle(id: string): void;
  onOpenItem(id: string): void;
}) {
  const panelId = useId();
  const open = isOpen(branch.id);
  return (
    <li data-branch-id={branch.id} className={depth === 0 ? "rounded-2xl border border-border bg-surface" : "border-t border-border"}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => onToggle(branch.id)}
        className="flex min-h-12 w-full items-center gap-2 px-3 py-2 text-left"
        style={{ paddingLeft: `${0.75 + depth * 1.25}rem` }}
      >
        <Icon name="chevron-down" size={16} className={`shrink-0 text-muted transition-transform ${open ? "" : "-rotate-90"}`} />
        <span className={`min-w-0 flex-1 truncate text-text ${depth === 0 ? "text-base font-black" : "text-sm font-bold"}`}>{branch.name}</span>
        {branch.soldOutCount > 0 ? (
          <span className="shrink-0 rounded-full border border-danger/40 px-2 py-0.5 text-[13px] font-bold text-danger">
            {`${branch.soldOutCount} tükendi`}
          </span>
        ) : null}
        <span className="shrink-0 rounded-full bg-surface-sunken px-2 py-0.5 text-[13px] font-semibold text-muted">{branch.itemCount}</span>
      </button>
      {open ? (
        <div id={panelId}>
          {branch.items.length > 0 ? (
            <ul>
              {branch.items.map((item) => (
                <li key={item.id} className="border-t border-border">
                  <button
                    type="button"
                    data-item-id={item.id}
                    data-available={item.isAvailable ? "true" : "false"}
                    onClick={() => onOpenItem(item.id)}
                    className="flex min-h-12 w-full items-center gap-3 py-2 pr-3 text-left hover:bg-surface-sunken"
                    style={{ paddingLeft: `${2.25 + depth * 1.25}rem` }}
                  >
                    <span className={`min-w-0 flex-1 truncate text-sm ${item.isAvailable ? "font-semibold text-text" : "font-semibold text-muted line-through"}`}>
                      {item.name}
                    </span>
                    {item.isAvailable ? null : <SoldOutBadge />}
                    <span className="shrink-0 text-right text-sm font-black tabular-nums text-text">
                      {item.price === null ? "—" : formatPrice(item.price, item.currency)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          {branch.branches.length > 0 ? (
            <ul>
              {branch.branches.map((child) => (
                <Branch key={child.id} branch={child} depth={depth + 1} isOpen={isOpen} onToggle={onToggle} onOpenItem={onOpenItem} />
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

function ItemDialog({
  item,
  path,
  canEdit,
  busy,
  onClose,
  onSet,
}: {
  item: MenuTreeNode;
  path: string;
  canEdit: boolean;
  busy: boolean;
  onClose(): void;
  onSet(available: boolean): void;
}) {
  const titleId = useId();
  const boxRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  useDialogFocus(
    boxRef,
    () => {
      if (!busy) onClose();
    },
    () => closeRef.current,
  );

  return (
    <div className="fixed inset-0 z-[1000] grid place-items-center bg-black/50 p-4" onClick={(e) => (e.target === e.currentTarget && !busy ? onClose() : undefined)}>
      <div
        ref={boxRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-2xl border border-border bg-surface p-5 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            {path ? <p className="text-[13px] font-semibold text-muted">{path}</p> : null}
            <h2 id={titleId} className="text-lg font-black text-text">{item.name}</h2>
          </div>
          <button ref={closeRef} type="button" aria-label="Kapat" onClick={onClose} disabled={busy} className="grid min-h-11 min-w-11 place-items-center rounded-xl border border-border text-text">
            <Icon name="close" size={18} />
          </button>
        </div>

        {item.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- menu photos are uploads served as they are
          <img src={item.imageUrl} alt="" className="mt-3 max-h-56 w-full rounded-xl object-cover" />
        ) : null}
        {item.detail ? <p className="mt-3 whitespace-pre-line text-sm text-text">{item.detail}</p> : null}

        <dl className="mt-4 grid grid-cols-2 gap-2.5">
          <div className="rounded-xl border border-border px-3 py-2">
            <dt className="text-[13px] font-medium text-muted">Fiyat</dt>
            <dd className="text-lg font-black tabular-nums text-text">{item.price === null ? "—" : formatPrice(item.price, item.currency)}</dd>
          </div>
          <div className={`rounded-xl border px-3 py-2 ${item.isAvailable ? "border-success/40" : "border-danger/40 bg-danger/10"}`}>
            <dt className="text-[13px] font-medium text-muted">Durum</dt>
            <dd data-testid="item-state" className={`text-lg font-black ${item.isAvailable ? "text-success" : "text-danger"}`}>
              {item.isAvailable ? "Menüde" : "Tükendi"}
            </dd>
          </div>
        </dl>
        {item.allergens.length > 0 ? <p className="mt-3 text-[13px] text-muted">{`Alerjenler: ${item.allergens.join(", ")}`}</p> : null}

        <p className="mt-4 text-[13px] text-muted">
          {item.isAvailable
            ? "Tükendi işaretlenen ürün bu otelin misafir oda servisi menüsünden hemen gizlenir; yöneticilere bildirim gider."
            : "İşaret kaldırılınca ürün misafir menüsünde hemen yeniden görünür; yöneticilere bildirim gider."}
        </p>

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} disabled={busy} className="min-h-12 rounded-xl border border-border bg-surface px-5 text-sm font-semibold text-text">
            Kapat
          </button>
          {canEdit ? (
            <button
              type="button"
              data-mutates
              disabled={busy}
              onClick={() => onSet(!item.isAvailable)}
              className={`min-h-14 rounded-xl px-6 text-sm font-black text-white disabled:opacity-40 ${item.isAvailable ? "bg-danger" : "bg-success"}`}
            >
              {item.isAvailable ? "Tükendi olarak işaretle" : "Tükendi işaretini kaldır"}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
