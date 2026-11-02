import { useStore } from "zustand";
import { createStore } from "zustand/vanilla";

/**
 * Promise API behind ConfirmDialog. Policy (spec §5.1): when the setting
 * `shell.confirmSimpleActions` is off, simple (`danger: false`) questions are answered "Evet"
 * without asking; dangerous ones (delete, approve, force logout) always ask.
 */

export type ConfirmOptions = {
  title: string;
  message: string;
  danger?: boolean;
  /** Action verb of the confirm button ("Sil", "Onayla"); default "Evet". */
  confirmLabel?: string;
  /** Default "Hayır", or "Vazgeç" for danger questions. */
  cancelLabel?: string;
};

type Request = ConfirmOptions & {
  kind: "confirm" | "alert";
  /** Which button gets the initial focus: the safe one (cancel) for danger questions. */
  autoFocusTarget: "ok" | "cancel";
  resolve(answer: boolean): void;
};

type ConfirmState = {
  request: Request | null;
  /** Value of `shell.confirmSimpleActions`; ShellClient sets it from the server settings. */
  confirmSimpleActions: boolean;
};

export const confirmStore = createStore<ConfirmState>()(() => ({
  request: null,
  confirmSimpleActions: false,
}));

function ask(request: Omit<Request, "resolve">): Promise<boolean> {
  return new Promise((resolve) => {
    // One question at a time: a newer one supersedes (and declines) the pending one.
    confirmStore.getState().request?.resolve(false);
    confirmStore.setState({ request: { ...request, resolve } });
  });
}

export function confirm(opts: ConfirmOptions): Promise<boolean> {
  const danger = opts.danger ?? false;
  if (!danger && !confirmStore.getState().confirmSimpleActions) return Promise.resolve(true);
  return ask({
    ...opts,
    danger,
    kind: "confirm",
    confirmLabel: opts.confirmLabel ?? "Evet",
    cancelLabel: opts.cancelLabel ?? (danger ? "Vazgeç" : "Hayır"),
    autoFocusTarget: danger ? "cancel" : "ok",
  });
}

/** Removing a desktop shortcut is a delete: always asked, whatever the setting says. */
export function confirmRemoveShortcut(appTitle: string): Promise<boolean> {
  return confirm({
    title: "Kısayolu kaldır",
    message: `"${appTitle}" kısayolu masaüstünden kaldırılsın mı? Uygulama Başlat menüsünde kalır.`,
    danger: true,
    confirmLabel: "Kaldır",
  });
}

/** Information box with a single "Tamam" button (Özellikler, Hakkında). */
export function alertDialog(opts: { title: string; message: string }): Promise<boolean> {
  return ask({ ...opts, danger: false, kind: "alert", autoFocusTarget: "ok" });
}

/** Answers the open question and clears it. */
export function answer(value: boolean): void {
  const { request } = confirmStore.getState();
  if (!request) return;
  confirmStore.setState({ request: null });
  request.resolve(value);
}

export function useConfirmRequest(): Request | null {
  return useStore(confirmStore, (s) => s.request);
}
