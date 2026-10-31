"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  listMyNotificationsAction,
  markAllReadAction,
  markNotificationReadAction,
  type NotificationDto,
} from "@/modules/core/server/notificationActions";
import type { SubscribeEvents } from "./events";

const LIMIT = 20;
const RELOAD_DEBOUNCE_MS = 200;

/**
 * The caller's last 20 notifications. Reloads on mount and whenever a `notification.created`
 * event arrives (so a new one shows up on top), marks read optimistically and rolls back by
 * reloading when the server refuses.
 */
export function useNotifications(subscribe: SubscribeEvents) {
  const [items, setItems] = useState<NotificationDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const latest = useRef(0);

  const load = useCallback(async () => {
    const mine = ++latest.current;
    try {
      const result = await listMyNotificationsAction(LIMIT);
      if (mine !== latest.current) return; // a newer load owns the state
      if (result.ok) {
        setItems(result.data);
        setError(null);
      } else {
        setError(result.error.message);
      }
    } catch {
      if (mine === latest.current) setError("Bildirimler alınamadı");
    }
  }, []);

  useEffect(() => {
    // Deferred: react-hooks/set-state-in-effect rejects a direct call that ends in setState.
    const first = setTimeout(() => void load(), 0);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const off = subscribe((e) => {
      if (e.type !== "notification.created") return;
      clearTimeout(timer);
      timer = setTimeout(() => void load(), RELOAD_DEBOUNCE_MS);
    });
    return () => {
      clearTimeout(first);
      clearTimeout(timer);
      off();
    };
  }, [subscribe, load]);

  const markRead = useCallback(
    async (id: string) => {
      setItems((prev) => prev?.map((n) => (n.id === id ? { ...n, isRead: true } : n)) ?? prev);
      try {
        const result = await markNotificationReadAction(id);
        if (!result.ok) await load();
      } catch {
        await load();
      }
    },
    [load],
  );

  const markAll = useCallback(async () => {
    setItems((prev) => prev?.map((n) => (n.isRead ? n : { ...n, isRead: true })) ?? prev);
    try {
      const result = await markAllReadAction();
      if (!result.ok) await load();
    } catch {
      await load();
    }
  }, [load]);

  const unread = items?.filter((n) => !n.isRead).length ?? 0;
  return { items, error, unread, markRead, markAll };
}
