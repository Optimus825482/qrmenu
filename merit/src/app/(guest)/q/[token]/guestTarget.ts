import { headers } from "next/headers";
import { cache } from "react";
import {
  globalUnknownTokenLimiter,
  guestMeta,
  resolveGuestTokenLimited,
  unknownTokenLimiter,
} from "@/modules/menu/server/guestToken";

/**
 * A document navigation (browser opening/reloading the URL), as opposed to a `router.refresh()` RSC
 * fetch: only the former is a QR scan worth a log row and a `scan.table` event.
 */
function isDocumentNavigation(h: Headers): boolean {
  const dest = h.get("sec-fetch-dest");
  if (dest) return dest === "document";
  return (h.get("accept") ?? "").includes("text/html");
}

/**
 * The guest token resolved once per request: the layout and the page share one lookup (one scan log,
 * one rate-limit hit).
 */
export const getGuestTarget = cache(async (token: string) => {
  const h = await headers();
  return resolveGuestTokenLimited(token, guestMeta(h), unknownTokenLimiter, globalUnknownTokenLimiter, {
    log: isDocumentNavigation(h),
  });
});
