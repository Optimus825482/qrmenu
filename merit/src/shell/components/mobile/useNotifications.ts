"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  listMyUnreadNotificationsAction,
  markAllReadAction,
  markNotificationReadAction,
  type NotificationDto,
} from "@/modules/core/server/notificationActions";
import type { SubscribeEvents } from "./events";

const LIMIT = 20;
const RELOAD_DEBOUNCE_MS = 200;

/**
 * The caller's unread notifications (newest 20), the one list behind the desktop bell, the staff bell and the
 * mobile Bildirimler tab, so the three behave alike: a notification leaves the list once it is read. Reloads on
 * mount and whenever a `notification.created` event arrives (so a new one shows up on top), drops read ones
 * optimistically and rolls back by reloading when the server refuses.
 */
export function useNotifications(subscribe: SubscribeEvents) {
  const [items, setItems] = useState<NotificationDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const latest = useRef(0);

  const load = useCallback(async () => {
    const mine = ++latest.current;
    try {
      const result = await listMyUnreadNotificationsAction(LIMIT);
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
      setItems((prev) => prev?.filter((n) => n.id !== id) ?? prev);
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
    setItems((prev) => (prev ? [] : prev));
    try {
      await markAllReadAction();
    } catch {
      // the reload below puts the list back
    }
    // Reload either way: a refusal must put the list back, and it confirms nothing unread is left.
    await load();
  }, [load]);

  const unread = items?.length ?? 0;
  return { items, error, unread, markRead, markAll };
}
