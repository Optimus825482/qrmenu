import { useStore } from "zustand";
import { createStore } from "zustand/vanilla";
import { alertDialog } from "./confirm";

/**
 * Non-blocking feedback (spec 5): success/info never open a modal. On the XP desktop the toast is
 * shown as a tray balloon plus a status text; on the Android shell as a snackbar. Errors on the XP
 * desktop stay a message box (the user must see them), on the snackbar they persist until dismissed.
 */

export type ToastKind = "success" | "error" | "info";

export type Toast = {
  id: string;
  kind: ToastKind;
  message: string;
  actionLabel?: string;
  onAction?: () => void | Promise<void>;
  /** null = stays until dismissed. */
  durationMs: number | null;
};

export type NotifySurface = "xp" | "snackbar";

type NotifyState = { toasts: Toast[]; statusText: string; surface: NotifySurface };

export const MAX_VISIBLE_TOASTS = 3;
export const SUCCESS_MS = 4000;
export const UNDO_MS = 6000;
export const STATUS_TEXT_MS = 4000;

export const notifyStore = createStore<NotifyState>()(() => ({
  toasts: [],
  statusText: "",
  surface: "xp",
}));

const timers = new Map<string, ReturnType<typeof setTimeout>>();
const remaining = new Map<string, { left: number; startedAt: number }>();
let statusTimer: ReturnType<typeof setTimeout> | undefined;
let seq = 0;

function clearTimer(id: string) {
  const t = timers.get(id);
  if (t) clearTimeout(t);
  timers.delete(id);
}

function startTimer(id: string, ms: number) {
  clearTimer(id);
  remaining.set(id, { left: ms, startedAt: Date.now() });
  timers.set(
    id,
    setTimeout(() => notify.dismiss(id), ms),
  );
}

/** Hover/focus pauses the countdown; leaving restarts it with the time that was left. */
export function pauseToast(id: string): void {
  const r = remaining.get(id);
  if (!r || !timers.has(id)) return;
  clearTimer(id);
  remaining.set(id, { left: Math.max(1000, r.left - (Date.now() - r.startedAt)), startedAt: 0 });
}

export function resumeToast(id: string): void {
  const r = remaining.get(id);
  if (!r || timers.has(id)) return;
  if (!notifyStore.getState().toasts.some((t) => t.id === id)) return;
  startTimer(id, r.left);
}

function setStatus(text: string) {
  clearTimeout(statusTimer);
  notifyStore.setState({ statusText: text });
  statusTimer = setTimeout(() => notifyStore.setState({ statusText: "" }), STATUS_TEXT_MS);
}

function push(toast: Omit<Toast, "id">): string {
  const id = `t${++seq}`;
  const full: Toast = { ...toast, id };
  const next = [full, ...notifyStore.getState().toasts];
  for (const dropped of next.slice(MAX_VISIBLE_TOASTS)) {
    clearTimer(dropped.id);
    remaining.delete(dropped.id);
  }
  notifyStore.setState({ toasts: next.slice(0, MAX_VISIBLE_TOASTS) });
  if (full.durationMs !== null) startTimer(id, full.durationMs);
  return id;
}

function messageOf(e: unknown): string {
  return e instanceof Error && e.message ? e.message : "bilinmeyen hata";
}

export const notify = {
  success(message: string, opts?: { undo?: () => void | Promise<void>; durationMs?: number }): string {
    const undo = opts?.undo;
    let used = false;
    const id = push({
      kind: "success",
      message,
      durationMs: opts?.durationMs ?? (undo ? UNDO_MS : SUCCESS_MS),
      ...(undo
        ? {
            actionLabel: "Geri al",
            onAction: async () => {
              if (used) return;
              used = true;
              notify.dismiss(id);
              try {
                await undo();
              } catch (e) {
                notify.error(`Geri alınamadı: ${messageOf(e)}`);
              }
            },
          }
        : {}),
    });
    if (notifyStore.getState().surface === "xp") setStatus(message);
    return id;
  },

  error(message: string, opts?: { title?: string; retry?: () => void | Promise<void> }): string {
    if (notifyStore.getState().surface === "xp") {
      void alertDialog({ title: opts?.title ?? "İşlem tamamlanamadı", message });
      return "";
    }
    const retry = opts?.retry;
    return push({
      kind: "error",
      message,
      durationMs: null,
      ...(retry ? { actionLabel: "Tekrar dene", onAction: retry } : {}),
    });
  },

  info(message: string, opts?: { actionLabel?: string; onAction?: () => void | Promise<void>; durationMs?: number | null }): string {
    const id = push({
      kind: "info",
      message,
      durationMs: opts?.durationMs === undefined ? SUCCESS_MS : opts.durationMs,
      ...(opts?.actionLabel && opts.onAction ? { actionLabel: opts.actionLabel, onAction: opts.onAction } : {}),
    });
    if (notifyStore.getState().surface === "xp") setStatus(message);
    return id;
  },

  dismiss(id: string): void {
    clearTimer(id);
    remaining.delete(id);
    const toasts = notifyStore.getState().toasts;
    if (toasts.some((t) => t.id === id)) {
      notifyStore.setState({ toasts: toasts.filter((t) => t.id !== id) });
    }
  },

  /** Clears every toast and timer (tests, sign-out). */
  clear(): void {
    for (const id of [...timers.keys()]) clearTimer(id);
    remaining.clear();
    clearTimeout(statusTimer);
    notifyStore.setState({ toasts: [], statusText: "" });
  },
};

export function setNotifySurface(surface: NotifySurface): void {
  notifyStore.setState({ surface });
}

export function useToasts(): Toast[] {
  return useStore(notifyStore, (s) => s.toasts);
}

export function useStatusText(): string {
  return useStore(notifyStore, (s) => s.statusText);
}
