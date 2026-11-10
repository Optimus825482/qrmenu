"use client";

import { useCallback, useRef, useState } from "react";
import type { Locale } from "@/lib/i18n/locales";

/** Message keys (`mybar.*`) the form can show for a failed or refused submission. */
export type GuestErrorKey =
  | "validationEmpty"
  | "err409Daily"
  | "errRate"
  | "errNetwork"
  | "errGeneric"
  | "errItems"
  | "errClosed";

export type SubmitOutcome = { ok: true } | { ok: false; error: GuestErrorKey };

type ApiBody = {
  ok?: boolean;
  error?: { code?: string; fieldErrors?: Record<string, string[]> };
};

function newKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  // Non-secure origins (plain-http on-prem hosts) have no randomUUID: build a v4 shaped id from getRandomValues.
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

const keyStore = (token: string) => `mybar-idem:${token}`;

/** The key survives a reload (sessionStorage, per room): a retry after a lost response replays the first submission. */
function readKey(token: string): string {
  try {
    const stored = window.sessionStorage.getItem(keyStore(token));
    if (stored) return stored;
  } catch {
    // Storage blocked: fall back to a key that lives as long as the page.
  }
  const fresh = newKey();
  try {
    window.sessionStorage.setItem(keyStore(token), fresh);
  } catch {
    // Same fallback.
  }
  return fresh;
}

function clearKey(token: string) {
  try {
    window.sessionStorage.removeItem(keyStore(token));
  } catch {
    // Nothing stored.
  }
}

/** Maps a refused response to the message key the guest sees (the server text is never shown). */
export function errorKeyFor(status: number, body: ApiBody | null): GuestErrorKey {
  const code = body?.error?.code;
  if (status === 429 || code === "RATE_LIMITED") return "errRate";
  if (code === "DAILY_LIMIT") return "err409Daily";
  if (code === "VALIDATION" && body?.error?.fieldErrors?.items) return "errItems";
  if (code === "CONFLICT" || code === "NOT_FOUND") return "errClosed";
  return "errGeneric";
}

/**
 * Sends the MyBar request. One idempotency key per form: a retry after a network error replays the
 * first submission instead of creating a second one, even after a reload; `reset()` issues a fresh key (a new request).
 */
export function useMybarSubmit(token: string, locale: Locale) {
  const key = useRef<string | null>(null);
  const [sending, setSending] = useState(false);

  const submit = useCallback(
    async (items: { productId: string; qty: number }[], note: string): Promise<SubmitOutcome> => {
      key.current ??= readKey(token);
      setSending(true);
      try {
        const trimmed = note.trim();
        const send = async () => {
          const res = await fetch(`/api/q/${encodeURIComponent(token)}/mybar`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              idempotencyKey: key.current,
              locale,
              items,
              ...(trimmed ? { note: trimmed } : {}),
            }),
          });
          let body: ApiBody | null = null;
          try {
            body = (await res.json()) as ApiBody;
          } catch {
            body = null;
          }
          return { res, body };
        };
        let { res, body } = await send();
        if (!res.ok && body?.error?.fieldErrors?.idempotencyKey) {
          // The stored key belongs to an earlier day: issue a fresh one and send once more.
          key.current = newKey();
          try {
            window.sessionStorage.setItem(keyStore(token), key.current);
          } catch {
            // Storage blocked: the key lives as long as the page.
          }
          ({ res, body } = await send());
        }
        if (res.ok && body?.ok) {
          // Done: the next request is a new one and must not replay this key.
          key.current = null;
          clearKey(token);
          return { ok: true };
        }
        return { ok: false, error: errorKeyFor(res.status, body) };
      } catch {
        return { ok: false, error: "errNetwork" };
      } finally {
        setSending(false);
      }
    },
    [token, locale],
  );

  const reset = useCallback(() => {
    key.current = null;
    clearKey(token);
  }, [token]);

  return { submit, sending, reset };
}
