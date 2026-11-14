"use client";

import { useEffect } from "react";
import { BUILD_ID } from "@/lib/version";

/** How often an open wall asks the server which build it runs. */
const CHECK_MS = 60_000;
/** The server build this tab last reloaded for: one reload per build, so a stale cached page cannot loop. */
const RELOADED_KEY = "merit_radar_wall_reloaded_for";

/**
 * A wall screen has nobody to press "Güncelle": after a release its page still calls the server actions of the
 * old build, which the new server no longer knows. True when the page should reload itself (pure).
 */
export function wallShouldReload(p: { clientBuildId: string; serverBuildId: string | undefined; reloadedFor: string | null }): boolean {
  if (!p.serverBuildId || p.serverBuildId === p.clientBuildId) return false;
  return p.reloadedFor !== p.serverBuildId;
}

async function serverBuildId(): Promise<string | undefined> {
  const res = await fetch(`/api/version?_t=${Date.now()}`, { cache: "no-store", headers: { Accept: "application/json" } });
  if (!res.ok) return undefined;
  const info = (await res.json()) as { buildId?: string };
  return info.buildId;
}

/**
 * Reloads the wall page when the server runs another build. Checked every minute, and at once when the
 * connection comes back (a release restarts the server, which drops the stream).
 */
export function useWallAutoReload(enabled: boolean, live: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    let stopped = false;
    const check = async () => {
      try {
        const server = await serverBuildId();
        if (stopped) return;
        let reloadedFor: string | null = null;
        try {
          reloadedFor = sessionStorage.getItem(RELOADED_KEY);
        } catch {
          // storage blocked: reload at most once per page life instead
        }
        if (!wallShouldReload({ clientBuildId: BUILD_ID, serverBuildId: server, reloadedFor })) return;
        stopped = true;
        try {
          sessionStorage.setItem(RELOADED_KEY, server!);
        } catch {
          // see above
        }
        // The installed app's static cache would serve the old scripts again.
        if ("caches" in window) {
          const keys = await caches.keys().catch(() => [] as string[]);
          await Promise.all(keys.filter((k) => k.startsWith("merit-static-")).map((k) => caches.delete(k).catch(() => false)));
        }
        window.location.reload();
      } catch {
        // The server is restarting: the next check tries again.
      }
    };
    if (live) void check();
    const id = setInterval(() => void check(), CHECK_MS);
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }, [enabled, live]);
}
