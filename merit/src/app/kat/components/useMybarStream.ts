"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { MeritEvent } from "@/lib/realtime-events";
import { acknowledgeMybarAction } from "@/modules/mybar/server/actions/requests";
import { listUnseenForAckAction } from "@/modules/mybar/server/actions/ack";
import type { MybarRow } from "@/modules/mybar/server/requests";
import { useSse } from "@/shell/useSse";

export interface MybarItem {
  id: string;
  roomId: string;
  roomNumber: string;
  floorId: string;
  floorName: string;
  requestedAt: string;
  items: { productName: string; qty: number }[];
  /** Setup products the guest asked to have taken out of the room (absent on an SSE-built entry until the next refetch). */
  removals?: { productName: string; qty: number }[];
  /** What the attendant reads: the Turkish translation when there is one, else the original. */
  notes: string | null;
  /** Guest's own wording, only when a translation replaced it. */
  noteOriginal?: string | null;
  noteLang?: string | null;
}

export function toMybarItem(row: MybarRow): MybarItem {
  return {
    id: row.id,
    roomId: row.roomId,
    roomNumber: row.roomNumber,
    floorId: "",
    floorName: row.floorName,
    requestedAt: new Date(row.createdAt).toISOString(),
    items: row.items.map((it) => ({ productName: it.name, qty: it.requestedQty })),
    removals: row.removals.map((it) => ({ productName: it.name, qty: it.requestedQty })),
    notes: row.noteTr ?? row.note,
    noteOriginal: row.noteTr ? row.note : null,
    noteLang: row.noteTr ? row.noteSrcLang : null,
  };
}

const STREAM_EVENTS = [
  "mybar.created",
  "mybar.seen",
  "mybar.acknowledged",
  "mybar.completed",
  "mybar.cancelled",
  "realtime.resync",
] as const;

export function applyMybarEvent(list: MybarItem[], event: MeritEvent): { next: MybarItem[]; needsRefetch: boolean } {
  const payload = (event.payload ?? {}) as Record<string, unknown>;
  const reqId = typeof payload.requestId === "string" ? payload.requestId : typeof payload.id === "string" ? payload.id : "";

  if (
    event.type === "mybar.seen" ||
    event.type === "mybar.acknowledged" ||
    event.type === "mybar.completed" ||
    event.type === "mybar.cancelled"
  ) {
    if (!reqId) return { next: list, needsRefetch: false };
    return { next: list.filter((it) => it.id !== reqId), needsRefetch: false };
  }

  if (event.type === "mybar.created") {
    const roomId = typeof payload.roomId === "string" ? payload.roomId : event.roomId ?? "";
    const roomNumber = typeof payload.roomNumber === "string" ? payload.roomNumber : "";
    const rawItems = Array.isArray(payload.items) ? payload.items : null;
    if (reqId && roomId && roomNumber && rawItems) {
      const items = rawItems
        .map((it) => {
          const r = (it ?? {}) as Record<string, unknown>;
          return {
            productName: typeof r.productName === "string" ? r.productName : String(r.name ?? ""),
            qty: Number(r.qty ?? r.requestedQty ?? 1),
          };
        })
        .filter((it) => it.productName.length > 0);
      const created: MybarItem = {
        id: reqId,
        roomId,
        roomNumber,
        floorId: typeof payload.floorId === "string" ? payload.floorId : "",
        floorName: typeof payload.floorName === "string" ? payload.floorName : "",
        requestedAt: typeof payload.requestedAt === "string" ? payload.requestedAt : event.at,
        items,
        notes: typeof payload.notes === "string" ? payload.notes : typeof payload.note === "string" ? payload.note : null,
      };
      if (list.some((it) => it.id === reqId)) return { next: list, needsRefetch: false };
      return { next: [...list, created], needsRefetch: false };
    }
    return { next: list, needsRefetch: true };
  }

  if (event.type === "realtime.resync") {
    return { next: list, needsRefetch: true };
  }

  return { next: list, needsRefetch: false };
}

export function useMybarStream(opts: { hotelId?: string } = {}): {
  pending: MybarItem[];
  ack: (id: string) => Promise<void>;
  connected: boolean;
} {
  const { hotelId } = opts;
  const [pending, setPendingState] = useState<MybarItem[]>([]);
  // The latest list, readable outside render: a state updater runs later, so "needs a refetch" cannot be read back from it.
  const listRef = useRef<MybarItem[]>([]);
  const mountedRef = useRef(true);
  const setPending = useCallback((next: MybarItem[]) => {
    listRef.current = next;
    setPendingState(next);
  }, []);

  const loadPending = useCallback(async () => {
    try {
      const res = await listUnseenForAckAction();
      if (!res.ok || !mountedRef.current) return;
      setPending(res.data.map(toMybarItem));
    } catch {
      // Bağlantı hatası sessizce yutulur; SSE resync ile yenilenir.
    }
  }, [setPending]);

  useEffect(() => {
    mountedRef.current = true;
    const t = setTimeout(() => void loadPending(), 0);
    return () => {
      mountedRef.current = false;
      clearTimeout(t);
    };
  }, [loadPending]);

  const { status } = useSse((event) => {
    if (hotelId && event.hotelId && event.hotelId !== hotelId) return;
    const { next, needsRefetch } = applyMybarEvent(listRef.current, event);
    if (next !== listRef.current) setPending(next);
    if (needsRefetch) void loadPending();
  }, STREAM_EVENTS);

  // An event published before the shared SSE connection opened is never replayed: once it is open, read the list again.
  useEffect(() => {
    if (status !== "open") return;
    const t = setTimeout(() => void loadPending(), 0);
    return () => clearTimeout(t);
  }, [status, loadPending]);

  const ack = useCallback(async (id: string) => {
    const res = await acknowledgeMybarAction(id);
    if (!res.ok) throw new Error(res.error.message);
    setPending(listRef.current.filter((r) => r.id !== id));
  }, [setPending]);

  return {
    pending,
    ack,
    connected: status === "open",
  };
}
