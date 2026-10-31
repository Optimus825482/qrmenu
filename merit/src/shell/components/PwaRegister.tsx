"use client";

import { useEffect } from "react";
import { listenForInstall } from "../usePwaInstall";

/** Cache names of public/sw.js start with this. */
const CACHE_PREFIX = "merit-";

/**
 * Registers public/sw.js in production builds and starts capturing the install offer. In
 * development no service worker runs: one left behind by a production build on the same origin is
 * unregistered and its caches dropped, so dev never serves stale assets.
 */
export function PwaRegister() {
  useEffect(() => {
    listenForInstall();
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
        // not fatal: the app works without it, it only cannot be installed in some browsers
      });
      return;
    }
    void navigator.serviceWorker
      .getRegistrations()
      .then((regs) => Promise.all(regs.map((r) => r.unregister())))
      .catch(() => {});
    if ("caches" in window) {
      void caches
        .keys()
        .then((keys) =>
          Promise.all(keys.filter((k) => k.startsWith(CACHE_PREFIX)).map((k) => caches.delete(k))),
        )
        .catch(() => {});
    }
  }, []);
  return null;
}
