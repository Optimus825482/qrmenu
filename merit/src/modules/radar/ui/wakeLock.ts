export type WakeLockSentinelLike = {
  release(): Promise<void>;
};

export type WakeLockNavLike = {
  wakeLock?: {
    request(type: "screen"): Promise<WakeLockSentinelLike>;
  };
};

/**
 * Requests a screen wake lock and re-acquires it whenever the document becomes visible again.
 * Never throws when the API is missing or permission is denied.
 */
export function acquireWakeLock(
  nav: WakeLockNavLike = typeof navigator !== "undefined" ? (navigator as unknown as WakeLockNavLike) : {},
  doc: Document | undefined = typeof document !== "undefined" ? document : undefined,
  onStatus?: (active: boolean) => void,
): { release(): void } {
  let sentinel: WakeLockSentinelLike | null = null;
  let released = false;

  const requestLock = () => {
    if (released) return;
    if (!nav?.wakeLock?.request) {
      onStatus?.(false);
      return;
    }
    void nav.wakeLock
      .request("screen")
      .then((s) => {
        if (released) {
          void s.release().catch(() => undefined);
          return;
        }
        sentinel = s;
        onStatus?.(true);
      })
      .catch(() => {
        onStatus?.(false);
      });
  };

  const onVisibilityChange = () => {
    if (released) return;
    if (!doc || doc.visibilityState === "visible") {
      requestLock();
    }
  };

  requestLock();
  doc?.addEventListener?.("visibilitychange", onVisibilityChange);

  return {
    release() {
      if (released) return;
      released = true;
      doc?.removeEventListener?.("visibilitychange", onVisibilityChange);
      if (sentinel) {
        const cur = sentinel;
        sentinel = null;
        void cur.release().catch(() => undefined);
      }
    },
  };
}
