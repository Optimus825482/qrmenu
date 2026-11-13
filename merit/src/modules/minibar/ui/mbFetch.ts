"use client";

import { useCallback, useSyncExternalStore } from "react";
import { hotelFromAddress } from "@/shell/useInShellFrame";

/**
 * `fetch` for the minibar screens: names the hotel the window shows (`?hotelId=` of the page address, or the
 * hotel the page's own selector holds when `hotelId` is given) in the `x-merit-hotel` header. The API serves
 * that hotel instead of the session's (server/selectedHotel.ts). Without a hotel it is plain `fetch`.
 */
export function mbFetch(input: string, init?: RequestInit, hotelId?: string): Promise<Response> {
  const hotel = hotelId || hotelFromAddress();
  if (!hotel) return fetch(input, init);
  const headers = new Headers(init?.headers);
  headers.set("x-merit-hotel", hotel);
  return fetch(input, { ...init, headers });
}

/** `href` with the window's hotel appended, so a link followed from the screen opens the same hotel. */
export function withHotel(href: string, hotelId?: string): string {
  const hotel = hotelId || hotelFromAddress();
  if (!hotel || /[?&]hotelId=/.test(href)) return href;
  return `${href}${href.includes("?") ? "&" : "?"}hotelId=${encodeURIComponent(hotel)}`;
}

const subscribe = () => () => {};

/**
 * `withHotel` for hrefs written during render: the bare href on the server and while hydrating (the address
 * is unknown there, a different href would be a hydration mismatch), the hotel's href right after.
 */
export function useHotelHref(): (href: string, hotelId?: string) => string {
  const hydrated = useSyncExternalStore(subscribe, () => true, () => false);
  return useCallback((href: string, hotelId?: string) => (hydrated ? withHotel(href, hotelId) : href), [hydrated]);
}
