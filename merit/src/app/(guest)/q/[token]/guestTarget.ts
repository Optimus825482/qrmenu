import { headers } from "next/headers";
import { cache } from "react";
import { guestMeta, resolveGuestTokenLimited } from "@/modules/menu/server/guestToken";

/**
 * The guest token resolved once per request: the layout and the page share one lookup (one scan log,
 * one rate-limit hit).
 */
export const getGuestTarget = cache(async (token: string) =>
  resolveGuestTokenLimited(token, guestMeta(await headers())),
);
