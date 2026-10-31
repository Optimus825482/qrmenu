"use client";

import { useEffect } from "react";
import { create, type StoreApi, type UseBoundStore } from "zustand";
import { persist } from "zustand/middleware";
import { MAX_QUANTITY } from "./ItemSheet";

export const MAX_LINES = 50;
export const RECENT_ORDERS = 5;

export type SelectionItem = {
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
  add: (item: SelectionItem) => void;
  setQty: (menuNodeId: string, qty: number, note?: string) => void;
  setItemNote: (menuNodeId: string, note: string) => void;
  remove: (menuNodeId: string) => void;
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

const clampQty = (n: number) => Math.min(MAX_QUANTITY, Math.max(1, Math.trunc(n) || 1));

type Store = UseBoundStore<StoreApi<SelectionState>> & {
  persist: { rehydrate: () => Promise<void> | void };
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
            return { items: [...s.items, { ...item, qty: clampQty(item.qty) }] };
          }),
        setQty: (menuNodeId, qty) =>
          set((s) => ({ items: s.items.map((i) => (i.menuNodeId === menuNodeId ? { ...i, qty: clampQty(qty) } : i)) })),
        setItemNote: (menuNodeId, note) =>
          set((s) => ({
            items: s.items.map((i) => {
              if (i.menuNodeId !== menuNodeId) return i;
              const next: SelectionItem = { menuNodeId: i.menuNodeId, name: i.name, qty: i.qty };
              if (i.unitPrice) next.unitPrice = i.unitPrice;
              if (note) next.note = note;
              return next;
            }),
          })),
        remove: (menuNodeId) => set((s) => ({ items: s.items.filter((i) => i.menuNodeId !== menuNodeId) })),
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
