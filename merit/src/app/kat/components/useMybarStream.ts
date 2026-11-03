"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { MeritEvent } from "@/lib/realtime-events";
import { useSse } from "@/shell/useSse";

export interface MybarItem {
  id: string;
  roomId: string;
  roomNumber: string;
  floorId: string;
  floorName: string;
  requestedAt: string;
  items: { productName: string; qty: number }[];
  notes: string | null;
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
  const [pending, setPending] = useState<MybarItem[]>([]);
  const mountedRef = useRef(true);

  const loadPending = useCallback(async () => {
    try {
      const url = hotelId
        ? `/api/minibar/dashboard?hotelId=${encodeURIComponent(hotelId)}`
        : "/api/minibar/dashboard";
      const dashRes = await fetch(url);
      if (!dashRes.ok) return;
      const dashJson = (await dashRes.json()) as {
        activeMybarCount?: number;
        floors?: { id: string; name: string; mybarCount: number }[];
      };
      if (!dashJson.activeMybarCount || dashJson.activeMybarCount === 0) {
        if (mountedRef.current) setPending([]);
        return;
      }
      const floorsWithMybar = (dashJson.floors ?? []).filter((f) => f.mybarCount > 0);
      const collected: MybarItem[] = [];
      for (const fl of floorsWithMybar) {
        const flRes = await fetch(`/api/minibar/floor/${fl.id}`);
        if (!flRes.ok) continue;
        const flJson = (await flRes.json()) as {
          rooms?: {
            id: string;
            number: string;
            hasMybarRequest?: boolean;
            mybarDetails?: {
              id: string;
              requestedAt: string;
              items: { productName: string; qty: number }[];
              notes: string | null;
            } | null;
          }[];
        };
        for (const rm of flJson.rooms ?? []) {
          if (rm.hasMybarRequest && rm.mybarDetails) {
            collected.push({
              id: rm.mybarDetails.id,
              roomId: rm.id,
              roomNumber: rm.number,
              floorId: fl.id,
              floorName: fl.name,
              requestedAt: rm.mybarDetails.requestedAt,
              items: rm.mybarDetails.items,
              notes: rm.mybarDetails.notes,
            });
          }
        }
      }
      if (mountedRef.current) setPending(collected);
    } catch {
      // Bağlantı hatası sessizce yutulur; SSE resync ile yenilenir.
    }
  }, [hotelId]);

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
    let shouldRefetch = false;
    setPending((curr) => {
      const { next, needsRefetch } = applyMybarEvent(curr, event);
      shouldRefetch = needsRefetch;
      return next;
    });
    if (shouldRefetch) void loadPending();
  }, STREAM_EVENTS);

  const ack = useCallback(async (id: string) => {
    const res = await fetch("/api/minibar/mybar/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestId: id }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
      throw new Error(body.error ?? body.message ?? "Talep onaylanamadı.");
    }
    setPending((prev) => prev.filter((r) => r.id !== id));
  }, []);

  return {
    pending,
    ack,
    connected: status === "open",
  };
}
