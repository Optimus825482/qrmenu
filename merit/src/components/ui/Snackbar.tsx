"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { notify, pauseToast, resumeToast, useToasts, type Toast } from "@/shell/notify";
import "@/shell/ui/snackbar.css";

// A shell and the confirm host may both mount a host on the same page: only one draws the toasts
// (the one placed above the bottom navigation wins, else the first mounted).
type HostEntry = { id: number; offset: boolean };
let hostSeq = 0;
let hostEntries: HostEntry[] = [];
const hostListeners = new Set<() => void>();
const primaryHostId = () => (hostEntries.find((h) => h.offset) ?? hostEntries[0])?.id;
const subscribeHosts = (cb: () => void) => {
  hostListeners.add(cb);
  return () => void hostListeners.delete(cb);
};
function registerHost(entry: HostEntry) {
  hostEntries = [...hostEntries, entry];
  hostListeners.forEach((cb) => cb());
  return () => {
    hostEntries = hostEntries.filter((h) => h !== entry);
    hostListeners.forEach((cb) => cb());
  };
}

/**
 * Snackbar host for the Android shell: bottom-centre, max 3 stacked (newest on top), success/info
 * are polite status messages, errors are alerts that stay. Esc dismisses the focused snackbar;
 * hover/focus pauses the auto-dismiss countdown.
 */
export function SnackbarHost({ bottomOffset }: { bottomOffset?: string }) {
  const toasts = useToasts();
  const [id] = useState(() => ++hostSeq);
  const hasOffset = bottomOffset !== undefined;
  useEffect(() => registerHost({ id, offset: hasOffset }), [id, hasOffset]);
  const primary = useSyncExternalStore(subscribeHosts, primaryHostId, () => undefined);
  if (toasts.length === 0 || primary !== id) return null;
  return (
    <div
      className="ui-snackbar-host"
      style={bottomOffset ? { bottom: `calc(${bottomOffset} + env(safe-area-inset-bottom, 0px))` } : undefined}
    >
      {toasts.map((t) => (
        <SnackbarItem key={t.id} toast={t} />
      ))}
    </div>
  );
}

function SnackbarItem({ toast }: { toast: Toast }) {
  const isError = toast.kind === "error";
  return (
    <div
      className="ui-snackbar"
      data-kind={toast.kind}
      role={isError ? "alert" : "status"}
      aria-live={isError ? "assertive" : "polite"}
      onMouseEnter={() => pauseToast(toast.id)}
      onMouseLeave={() => resumeToast(toast.id)}
      onFocus={() => pauseToast(toast.id)}
      onBlur={() => resumeToast(toast.id)}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          notify.dismiss(toast.id);
        }
      }}
    >
      <span className="ui-snackbar-text">{toast.message}</span>
      {toast.onAction ? (
        <button type="button" className="ui-snackbar-btn" onClick={() => void toast.onAction?.()}>
          {toast.actionLabel}
        </button>
      ) : null}
      {isError || toast.onAction ? (
        <button
          type="button"
          className="ui-snackbar-btn"
          data-dismiss=""
          aria-label="Kapat"
          onClick={() => notify.dismiss(toast.id)}
        >
          Kapat
        </button>
      ) : null}
    </div>
  );
}
