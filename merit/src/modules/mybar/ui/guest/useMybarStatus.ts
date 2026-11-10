"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Locale } from "@/lib/i18n/locales";
import { backoffMs } from "@/modules/menu/ui/guest/useGuestEvents";

export type MybarStatusKey = "BEKLIYOR" | "GORULDU" | "KARSILANDI" | "KISMEN" | "IPTAL";
export type MybarRequestView = {
  requestId: string;
  status: MybarStatusKey;
  createdAt: string;
  items: { name: string; qty: number }[];
};

const LIVE_EVENTS = ["mybar.seen", "mybar.fulfilled", "mybar.completed", "mybar.cancelled"] as const;
const POLL_MS = 45_000;

export const isTerminal = (status: MybarStatusKey | undefined): boolean =>
  status === "KARSILANDI" || status === "KISMEN" || status === "IPTAL";

/**
 * The room's request of today, kept live: the guest SSE stream (`mybar.*` events of this room only, reduced
 * to the request id) triggers a re-read; a slow poll covers a dropped stream. Terminal states stop the stream.
 */
export function useMybarStatus(token: string, locale: Locale, initial: MybarRequestView | null) {
  const [request, setRequest] = useState<MybarRequestView | null>(initial);
  const alive = useRef(true);

  const refresh = useCallback(async (): Promise<MybarRequestView | null> => {
    try {
      const res = await fetch(`/api/q/${encodeURIComponent(token)}/mybar?locale=${locale}`, { cache: "no-store" });
      if (!res.ok) return null;
      const body = (await res.json()) as { ok?: boolean; data?: { request: MybarRequestView | null } };
      if (!body.ok || !body.data) return null;
      if (alive.current) setRequest(body.data.request);
      return body.data.request;
    } catch {
      return null;
    }
  }, [token, locale]);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const live = request !== null && !isTerminal(request.status);
  useEffect(() => {
    if (!live) return;
    let source: EventSource | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let attempt = 0;
    let stopped = false;

    const connect = () => {
      const es = new EventSource(`/api/q/${encodeURIComponent(token)}/events`);
      source = es;
      es.addEventListener("hello", () => {
        attempt = 0;
        // Events may have fired before the stream opened (first connect) or while it was down (reconnect).
        void refresh();
      });
      es.addEventListener("reconnect", () => {
        es.close();
        if (!stopped) timer = setTimeout(connect, 1_000);
      });
      es.onerror = () => {
        if (stopped) return;
        es.close();
        timer = setTimeout(connect, backoffMs(attempt));
        attempt += 1;
      };
      for (const type of LIVE_EVENTS) es.addEventListener(type, () => void refresh());
    };
    connect();
    const poll = setInterval(() => void refresh(), POLL_MS);
    return () => {
      stopped = true;
      if (timer !== undefined) clearTimeout(timer);
      clearInterval(poll);
      source?.close();
    };
  }, [live, token, refresh]);

  return { request, refresh };
}
