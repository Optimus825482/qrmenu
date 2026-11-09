"use client";

import { useCallback, useEffect, useState } from "react";
import { runningStandalone } from "./usePwaInstall";
import { APP_VERSION, BUILD_ID } from "@/lib/version";

export interface VersionMetadata {
  name: string;
  version: string;
  buildDate: string;
  buildId: string;
  codename: string;
  highlights: string[];
  timestamp: number;
}

const CLIENT_VERSION = APP_VERSION;
const CLIENT_BUILD_ID = BUILD_ID;
const SNOOZE_KEY = "merit_update_snoozed_until";
const CHECK_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes

export function useAppUpdate() {
  const [hasUpdate, setHasUpdate] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);
  const [serverInfo, setServerInfo] = useState<VersionMetadata | null>(null);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const [isStandalone, setIsStandalone] = useState(false);
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);

  // Check standalone mode on client
  useEffect(() => {
    setIsStandalone(runningStandalone());
  }, []);

  const checkForUpdate = useCallback(async (manual = false): Promise<{ hasUpdate: boolean; info?: VersionMetadata }> => {
    if (typeof window === "undefined") return { hasUpdate: false };

    setIsChecking(true);
    try {
      // 1. Trigger Service Worker update check if available
      let reg: ServiceWorkerRegistration | undefined;
      if ("serviceWorker" in navigator) {
        try {
          reg = await navigator.serviceWorker.getRegistration();
          if (reg) {
            await reg.update().catch(() => {});
            if (reg.waiting) {
              setWaitingWorker(reg.waiting);
              setHasUpdate(true);
            }
          }
        } catch {
          // non-fatal
        }
      }

      // 2. Fetch live server version endpoint with cache busting
      const res = await fetch(`/api/version?_t=${Date.now()}`, {
        cache: "no-store",
        headers: { Accept: "application/json" },
      });

      if (!res.ok) {
        setIsChecking(false);
        return { hasUpdate: false };
      }

      const info: VersionMetadata = await res.json();
      setServerInfo(info);
      setLastChecked(new Date());

      // Compare buildId and version
      const isNewBuild = info.buildId && info.buildId !== CLIENT_BUILD_ID;
      const isNewVersion = info.version && info.version !== CLIENT_VERSION;
      const updateFound = Boolean(isNewBuild || isNewVersion || (reg && reg.waiting));

      if (updateFound) {
        // Check snooze unless manual check
        if (!manual) {
          const snoozedUntil = sessionStorage.getItem(SNOOZE_KEY);
          if (snoozedUntil && Date.now() < parseInt(snoozedUntil, 10)) {
            setIsChecking(false);
            return { hasUpdate: true, info };
          }
        }
        setHasUpdate(true);
        setIsDismissed(false);
      } else {
        setHasUpdate(false);
      }

      setIsChecking(false);
      return { hasUpdate: updateFound, info };
    } catch {
      setIsChecking(false);
      return { hasUpdate: false };
    }
  }, []);

  const applyUpdate = useCallback(async () => {
    setIsUpdating(true);
    try {
      // 1. Tell waiting service worker to skip waiting
      if (waitingWorker) {
        waitingWorker.postMessage({ type: "SKIP_WAITING" });
      } else if ("serviceWorker" in navigator) {
        const reg = await navigator.serviceWorker.getRegistration();
        if (reg?.waiting) {
          reg.waiting.postMessage({ type: "SKIP_WAITING" });
        }
      }

      // 2. Clear static asset caches
      if ("caches" in window) {
        try {
          const keys = await caches.keys();
          await Promise.all(
            keys
              .filter((k) => k.startsWith("merit-static-"))
              .map((k) => caches.delete(k)),
          );
        } catch {
          // non-fatal
        }
      }

      // 3. Clear snooze flag
      sessionStorage.removeItem(SNOOZE_KEY);

      // 4. Slight delay to let SW activate, then hard refresh
      setTimeout(() => {
        window.location.reload();
      }, 350);
    } catch {
      window.location.reload();
    }
  }, [waitingWorker]);

  const dismissUpdate = useCallback(() => {
    setIsDismissed(true);
    // Snooze for 30 minutes
    const snoozeTime = Date.now() + 30 * 60 * 1000;
    sessionStorage.setItem(SNOOZE_KEY, snoozeTime.toString());
  }, []);

  // Listen for SW updates and periodic checks
  useEffect(() => {
    if (typeof window === "undefined") return;

    // Listen for Service Worker updatefound
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.getRegistration().then((reg) => {
        if (!reg) return;
        if (reg.waiting) {
          setWaitingWorker(reg.waiting);
          setHasUpdate(true);
        }
        reg.addEventListener("updatefound", () => {
          const newWorker = reg.installing;
          if (!newWorker) return;
          newWorker.addEventListener("statechange", () => {
            if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
              setWaitingWorker(newWorker);
              setHasUpdate(true);
            }
          });
        });
      }).catch(() => {});

      // Controller change -> reload if updating
      let refreshing = false;
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (!refreshing && isUpdating) {
          refreshing = true;
          window.location.reload();
        }
      });
    }

    // Initial check after short delay
    const initialTimer = setTimeout(() => {
      void checkForUpdate();
    }, 2500);

    // Periodic check
    const intervalTimer = setInterval(() => {
      void checkForUpdate();
    }, CHECK_INTERVAL_MS);

    // Check on focus / visibility change
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void checkForUpdate();
      }
    };
    window.addEventListener("focus", onVisibilityChange);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      clearTimeout(initialTimer);
      clearInterval(intervalTimer);
      window.removeEventListener("focus", onVisibilityChange);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [checkForUpdate, isUpdating]);

  return {
    hasUpdate: hasUpdate && !isDismissed,
    isChecking,
    isUpdating,
    isStandalone,
    currentVersion: CLIENT_VERSION,
    currentBuildId: CLIENT_BUILD_ID,
    serverInfo,
    lastChecked,
    checkForUpdate,
    applyUpdate,
    dismissUpdate,
  };
}
