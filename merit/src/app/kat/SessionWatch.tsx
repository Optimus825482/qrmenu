"use client";

import { useSse } from "@/shell/useSse";

/**
 * Keeps the tab's SSE stream open on every /kat page so a `session.closed` frame (force logout,
 * password reset) ends the tab on /giris; the store handles the redirect.
 */
export function SessionWatch() {
  useSse(() => {});
  return null;
}
