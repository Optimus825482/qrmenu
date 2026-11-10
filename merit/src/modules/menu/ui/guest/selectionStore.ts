"use client";

import { useEffect } from "react";
import { create, type StoreApi, type UseBoundStore } from "zustand";
import { persist } from "zustand/middleware";
import { MAX_QUANTITY } from "./ItemSheet";

export const MAX_LINES = 50;
export const RECENT_ORDERS = 5;

export type SelectionItem = {
  /** Unique id of this line (a node may appear in several lines with different notes). Never sent to the server. */
  lineId: string;
  menuNodeId: string;
  name: string;
  qty: number;
  note?: string;
  /** Decimal string of the price shown to the guest; absent while prices are hidden. */
  unitPrice?: string;
};

export type SelectionState = {
  items: SelectionItem[];
  /** General note of the order. */
  note: string;
  /** Orders this guest sent from this device, newest last. */
  orderIds: string[];
  orderNos: Record<string, number>;
  idempotencyKey: string | null;
  /** Names dropped by the last `reconcile` (not persisted); the drawer shows them once. */
  removedNames: string[];
  add: (item: Omit<SelectionItem, "lineId">) => void;
  setQty: (lineId: string, qty: number) => void;
  setItemNote: (lineId: string, note: string) => void;
  remove: (lineId: string) => void;
  /**
   * Aligns the lines with the current menu (only available dishes in `available`): a dish that is gone
   * or sold out is dropped (its name goes to `removedNames`); name and price come from the menu.
   */
  reconcile: (available: ReadonlyMap<string, { name: string; price?: string }>) => void;
  dismissRemoved: () => void;
  setNote: (note: string) => void;
  clear: () => void;
  ensureIdempotencyKey: () => string;
  rememberOrder: (id: string, orderNo?: number) => void;
};

/** A v4 uuid; `crypto.randomUUID` only exists in secure contexts and the menu is often served over plain http. */
export function newKey(): string {
  const c = globalThis.crypto;
  if (typeof c?.randomUUID === "function") return c.randomUUID();
  const b = new Uint8Array(16);
  if (c?.getRandomValues) c.getRandomValues(b);
  else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0"));
  return `${h.slice(0, 4).join("")}-${h.slice(4, 6).join("")}-${h.slice(6, 8).join("")}-${h.slice(8, 10).join("")}-${h.slice(10).join("")}`;
}

/** Lines saved before `lineId` existed get one when they are loaded. */
function withLineIds(items: unknown): SelectionItem[] {
  if (!Array.isArray(items)) return [];
  return items
    .filter((i): i is SelectionItem => typeof i === "object" && i !== null && typeof (i as SelectionItem).menuNodeId === "string")
    .map((i) => (typeof i.lineId === "string" && i.lineId ? i : { ...i, lineId: newKey() }));
}

const clampQty = (n: number) => Math.min(MAX_QUANTITY, Math.max(1, Math.trunc(n) || 1));

type Store = UseBoundStore<StoreApi<SelectionState>> & {
  persist: {
    rehydrate: () => Promise<void> | void;
    hasHydrated: () => boolean;
    onFinishHydration: (fn: () => void) => () => void;
  };
};
const stores = new Map<string, Store>();

function createSelectionStore(token: string): Store {
  return create<SelectionState>()(
    persist(
      (set, get) => ({
        items: [],
        note: "",
        orderIds: [],
        orderNos: {},
        idempotencyKey: null,
        removedNames: [],
        add: (item) =>
          set((s) => {
            const same = s.items.find((i) => i.menuNodeId === item.menuNodeId && (i.note ?? "") === (item.note ?? ""));
            if (same) {
              return {
                items: s.items.map((i) =>
                  i === same ? { ...i, qty: clampQty(i.qty + item.qty), unitPrice: item.unitPrice ?? i.unitPrice } : i,
                ),
              };
            }
            if (s.items.length >= MAX_LINES) return s;
            return { items: [...s.items, { ...item, lineId: newKey(), qty: clampQty(item.qty) }] };
          }),
        setQty: (lineId, qty) =>
          set((s) => ({ items: s.items.map((i) => (i.lineId === lineId ? { ...i, qty: clampQty(qty) } : i)) })),
        setItemNote: (lineId, note) =>
          set((s) => ({
            items: s.items.map((i) => {
              if (i.lineId !== lineId) return i;
              const next: SelectionItem = { lineId: i.lineId, menuNodeId: i.menuNodeId, name: i.name, qty: i.qty };
              if (i.unitPrice) next.unitPrice = i.unitPrice;
              if (note) next.note = note;
              return next;
            }),
          })),
        remove: (lineId) => set((s) => ({ items: s.items.filter((i) => i.lineId !== lineId) })),
        reconcile: (available) =>
          set((s) => {
            const removed: string[] = [];
            const items: SelectionItem[] = [];
            for (const i of s.items) {
              const current = available.get(i.menuNodeId);
              if (!current) {
                removed.push(i.name);
                continue;
              }
              const next: SelectionItem = { ...i, name: current.name };
              if (current.price) next.unitPrice = current.price;
              else delete next.unitPrice;
              items.push(next);
            }
            const unchanged =
              removed.length === 0 &&
              items.every((n, k) => n.name === s.items[k].name && n.unitPrice === s.items[k].unitPrice);
            if (unchanged) return s;
            return {
              items,
              removedNames: removed.length > 0 ? [...new Set([...s.removedNames, ...removed])] : s.removedNames,
              // The price/lines changed: the next send is a different order, not a retry.
              idempotencyKey: null,
            };
          }),
        dismissRemoved: () => set((s) => (s.removedNames.length > 0 ? { removedNames: [] } : s)),
        setNote: (note) => set({ note }),
        clear: () => set({ items: [], note: "", idempotencyKey: null }),
        ensureIdempotencyKey: () => {
          const existing = get().idempotencyKey;
          if (existing) return existing;
          const key = newKey();
          set({ idempotencyKey: key });
          return key;
        },
        rememberOrder: (id, orderNo) =>
          set((s) => {
            const orderIds = [...s.orderIds.filter((x) => x !== id), id].slice(-RECENT_ORDERS * 4);
            const orderNos = { ...s.orderNos, ...(orderNo === undefined ? {} : { [id]: orderNo }) };
            for (const key of Object.keys(orderNos)) if (!orderIds.includes(key)) delete orderNos[key];
            return { orderIds, orderNos };
          }),
      }),
      {
        name: `merit_selections_${token}`,
        skipHydration: true, // hydrated in an effect: the server render never sees localStorage
        merge: (persisted, current) => {
          const saved = (persisted ?? {}) as Partial<SelectionState>;
          return { ...current, ...saved, items: withLineIds(saved.items) };
        },
        partialize: (s) => ({
          items: s.items,
          note: s.note,
          orderIds: s.orderIds,
          orderNos: s.orderNos,
          idempotencyKey: s.idempotencyKey,
        }),
      },
    ),
  );
}

/** The selections store of one table token (one instance per token, persisted in localStorage). */
export function getSelectionStore(token: string): Store {
  let store = stores.get(token);
  if (!store) {
    store = createSelectionStore(token);
    stores.set(token, store);
  }
  return store;
}

/** Store hook; rehydrates from localStorage after mount (every user of the hook may call it, it is idempotent). */
export function useSelectionStore(token: string): Store {
  const store = getSelectionStore(token);
  useEffect(() => {
    void store.persist.rehydrate();
  }, [store]);
  return store;
}

export const totalQuantity = (items: readonly SelectionItem[]): number => items.reduce((n, i) => n + i.qty, 0);
