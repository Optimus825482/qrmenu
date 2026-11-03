import { useStore } from "zustand";
import { createStore } from "zustand/vanilla";

/**
 * Promise API behind ReasonDialog (replaces window.prompt). Hand-off: UX T3 owns `src/shell/confirm.ts`;
 * when it lands this store can move next to `confirmStore` without changing the call sites.
 */

export type ReasonOptions = {
  title: string;
  message?: string;
  reasons: readonly string[];
  minLength: number;
  confirmLabel: string;
  danger?: boolean;
};

type ReasonRequest = ReasonOptions & { resolve(reason: string | null): void };

export const reasonStore = createStore<{ request: ReasonRequest | null }>()(() => ({ request: null }));

/** Resolves with the trimmed reason, or `null` when the user cancels. One question at a time. */
export function askReason(opts: ReasonOptions): Promise<string | null> {
  return new Promise((resolve) => {
    reasonStore.getState().request?.resolve(null);
    reasonStore.setState({ request: { ...opts, resolve } });
  });
}

/** Closes the open question with `value` (null = cancelled). */
export function answerReason(value: string | null): void {
  const { request } = reasonStore.getState();
  if (!request) return;
  reasonStore.setState({ request: null });
  request.resolve(value);
}

export function useReasonRequest(): ReasonRequest | null {
  return useStore(reasonStore, (s) => s.request);
}
