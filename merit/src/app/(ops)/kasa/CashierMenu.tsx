"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { listMenuTreeAction, setMenuAvailabilityAction } from "@/modules/menu/server/actions/menuTree";
import { setOutletPriceDisplayAction } from "@/modules/menu/server/actions/outletSwitches";
import type { MenuTreeNode } from "@/modules/menu/server/menuTree";
import { useSse } from "@/shell/useSse";

const EVENTS = ["menu.changed", "menu.availability", "price.display"] as const;

function flatten(nodes: MenuTreeNode[], parents: string[] = []): { node: MenuTreeNode; path: string }[] {
  return nodes.flatMap((node) => {
    const path = [...parents, node.name];
    return [
      ...(node.kind === "OGE" ? [{ node, path: parents.join(" · ") }] : []),
      ...flatten(node.children, path),
    ];
  });
}

export default function CashierMenu({
  outletId,
  canEdit,
  priceDisplay: initialPriceDisplay = "INHERIT",
  onPriceDisplayChange,
}: {
  outletId: string;
  canEdit: boolean;
  priceDisplay?: "INHERIT" | "SHOW" | "HIDE";
  onPriceDisplayChange?: (next: "INHERIT" | "SHOW" | "HIDE") => void;
}) {
  const [nodes, setNodes] = useState<MenuTreeNode[]>([]);
  const [priceDisplay, setPriceDisplay] = useState(initialPriceDisplay);
  const [prevInitial, setPrevInitial] = useState(initialPriceDisplay);
  if (prevInitial !== initialPriceDisplay) {
    setPrevInitial(initialPriceDisplay);
    setPriceDisplay(initialPriceDisplay);
  }
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  const load = useCallback(async () => {
    const result = await listMenuTreeAction({ outletId });
    if (result.ok) {
      setNodes(result.data);
      setError("");
    } else {
      setError(result.error.message);
    }
  }, [outletId]);

  useEffect(() => {
    let live = true;
    void listMenuTreeAction({ outletId }).then((result) => {
      if (!live) return;
      if (result.ok) {
        setNodes(result.data);
        setError("");
      } else {
        setError(result.error.message);
      }
    });
    return () => { live = false; };
  }, [outletId]);

  useSse((event) => {
    if (event.outletId === outletId) {
      void load();
    }
  }, EVENTS);

  const toggle = (node: MenuTreeNode) => startTransition(async () => {
    const result = await setMenuAvailabilityAction({ nodeId: node.id, available: !node.isAvailable });
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    await load();
  });

  const togglePrice = (value: "SHOW" | "HIDE") =>
    startTransition(async () => {
      setPriceDisplay(value);
      onPriceDisplayChange?.(value);
      const result = await setOutletPriceDisplayAction({ id: outletId, value });
      if (!result.ok) {
        setError(result.error.message);
        setPriceDisplay(initialPriceDisplay);
      }
    });

  const items = flatten(nodes);
  return (
    <section className="merit-kiosk-menu space-y-4" aria-label="Outlet menüsü">
      <header>
        <h2 className="text-xl font-semibold">Outlet menüsü</h2>
        <p className="text-sm text-muted">Satışı biten ürünleri geçici olarak kapatıp açabilir, menüde fiyat gösterimini yönetebilirsiniz.</p>
      </header>

      {/* Menü Fiyat Durumu & Canlı Değiştirme Kartı */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border bg-surface p-4 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <span
              className={`inline-block h-2.5 w-2.5 rounded-full ${
                priceDisplay === "SHOW" ? "bg-emerald-500 ring-2 ring-emerald-200" : "bg-rose-500 ring-2 ring-rose-200"
              }`}
            />
            <h3 className="font-semibold text-base">QR Menü Fiyat Gösterimi</h3>
          </div>
          <p className="text-xs text-muted mt-0.5">
            {priceDisplay === "SHOW"
              ? "🟢 Fiyatlar şu anda misafir QR menüsünde açık ve görünür durumdadır."
              : "🔴 Fiyatlar şu anda misafir QR menüsünde gizlidir (fiyatsız katalog modu)."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={!canEdit || pending}
            onClick={() => togglePrice("SHOW")}
            className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
              priceDisplay === "SHOW"
                ? "bg-emerald-600 text-white shadow-sm"
                : "border border-border bg-background text-muted hover:text-foreground"
            } disabled:opacity-50`}
            title={canEdit ? "Fiyatları misafir menüsünde aç" : "Kasa düzenleme yetkisi gereklidir"}
          >
            Fiyatları Göster
          </button>
          <button
            type="button"
            disabled={!canEdit || pending}
            onClick={() => togglePrice("HIDE")}
            className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
              priceDisplay === "HIDE"
                ? "bg-rose-600 text-white shadow-sm"
                : "border border-border bg-background text-muted hover:text-foreground"
            } disabled:opacity-50`}
            title={canEdit ? "Fiyatları misafir menüsünde gizle" : "Kasa düzenleme yetkisi gereklidir"}
          >
            Fiyatları Gizle
          </button>
        </div>
      </div>

      {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
      {items.length === 0 ? <p className="text-muted">Bu outlet için menü öğesi tanımlanmamış.</p> : null}
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {items.map(({ node, path }) => (
          <article key={node.id} className="flex min-h-20 items-center justify-between gap-3 rounded-xl border border-border bg-surface p-4">
            <div className="min-w-0">
              <h3 className="font-semibold">{node.name}</h3>
              {path ? <p className="text-sm text-muted">{path}</p> : null}
              {node.price !== null ? <p className="text-sm">{node.price} {node.currency}</p> : null}
            </div>
            <label className="flex shrink-0 items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                role="switch"
                checked={node.isAvailable}
                disabled={!canEdit || pending || !node.isActive}
                onChange={() => toggle(node)}
                aria-label={`${node.name} satışta`}
              />
              {node.isAvailable ? "Satışta" : "Tükendi"}
            </label>
          </article>
        ))}
      </div>
    </section>
  );
}
