"use client";

import { useEffect } from "react";
import { BUILD_ID } from "@/lib/version";
import { wallShouldReload } from "@/modules/radar/ui/wallReload";

/** How often an open page asks the server which build it runs. */
const CHECK_MS = 2 * 60_000;
/** A page reloads itself only after nobody has touched it for this long. */
export const IDLE_BEFORE_RELOAD_MS = 2 * 60_000;
/** The server build this tab last reloaded for: one reload per build, so a stale cached page cannot loop. */
const RELOADED_KEY = "merit_stale_build_reloaded_for";
/**
 * Set right before an automatic reload: the reloaded page tells the user it moved to the new version
 * (AppUpdateNotifier), since the "Güncelle" notice never got the chance to show.
 */
export const AUTO_UPDATED_KEY = "merit_auto_updated";

/**
 * After a release, a page opened before it still calls the server actions of the old build; the new server
 * answers "Failed to find Server Action" and the screen silently stops refreshing (tablets, panels left open).
 * True when the page should reload itself now (pure): the server runs another build, this tab has not already
 * reloaded for it, and nobody is using the page (idle long enough, not typing in a field).
 */
export function staleBuildShouldReload(p: {
  clientBuildId: string;
  serverBuildId: string | undefined;
  reloadedFor: string | null;
  idleMs: number;
  editing: boolean;
}): boolean {
  if (!wallShouldReload(p)) return false;
  if (p.editing) return false;
  return p.idleMs >= IDLE_BEFORE_RELOAD_MS;
}

function isEditing(): boolean {
  const el = document.activeElement as HTMLElement | null;
  if (!el) return false;
  if (el.isContentEditable) return true;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

function readReloadedFor(): string | null {
  try {
    return sessionStorage.getItem(RELOADED_KEY);
  } catch {
    return null;
  }
}

/**
 * Mounted once in the root layout, so desktop, staff/tablet, mobile and guest pages all behave the same.
 * Active users still get the "Güncelle" notice; an unattended page reloads itself once it is idle.
 */
export function StaleBuildReload(): null {
  useEffect(() => {
    let stopped = false;
    let lastActivity = Date.now();
    let pendingBuild: string | undefined;

    const markActive = () => {
      lastActivity = Date.now();
    };

    const reloadFor = async (server: string) => {
      stopped = true;
      try {
        sessionStorage.setItem(RELOADED_KEY, server);
        sessionStorage.setItem(AUTO_UPDATED_KEY, "1");
      } catch {
        // storage blocked: `stopped` still limits this page life to one reload
      }
      // The installed app's static cache would serve the old scripts again.
      if ("caches" in window) {
        const keys = await caches.keys().catch(() => [] as string[]);
        await Promise.all(keys.filter((k) => k.startsWith("merit-static-")).map((k) => caches.delete(k).catch(() => false)));
      }
      window.location.reload();
    };

    const decide = () => {
      if (stopped || !pendingBuild) return;
      const should = staleBuildShouldReload({
        clientBuildId: BUILD_ID,
        serverBuildId: pendingBuild,
        reloadedFor: readReloadedFor(),
        idleMs: Date.now() - lastActivity,
        editing: isEditing(),
      });
      if (should) void reloadFor(pendingBuild);
    };

    const check = async () => {
      if (stopped) return;
      try {
        const res = await fetch(`/api/version?_t=${Date.now()}`, { cache: "no-store", headers: { Accept: "application/json" } });
        if (!res.ok) return;
        const info = (await res.json()) as { buildId?: string };
        if (info.buildId && info.buildId !== BUILD_ID) pendingBuild = info.buildId;
        decide();
      } catch {
        // The server is restarting: the next check tries again.
      }
    };

    const onVisible = () => {
      if (document.visibilityState === "visible") void check();
    };

    const activity = ["pointerdown", "keydown", "wheel", "touchstart"] as const;
    for (const e of activity) window.addEventListener(e, markActive, { passive: true });
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onVisible);

    const firstId = setTimeout(() => void check(), 5_000);
    const checkId = setInterval(() => void check(), CHECK_MS);
    // Once a new build is known, re-evaluate often so the page reloads soon after the user steps away.
    const decideId = setInterval(decide, 15_000);

    return () => {
      stopped = true;
      clearTimeout(firstId);
      clearInterval(checkId);
      clearInterval(decideId);
      for (const e of activity) window.removeEventListener(e, markActive);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onVisible);
    };
  }, []);
  return null;
}
