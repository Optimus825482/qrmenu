/**
 * Address of the guest language route and the page it sends the guest back to.
 *
 * The guest pages are served with `referrer: no-referrer`, so the route cannot learn the current page
 * from the request: the caller passes it as `from`. Without it a guest who changed the language on
 * the room-service menu, the MyBar page or an order page was dropped on the room's home page.
 */

const TOKEN_FORMAT = /^[A-Za-z0-9_-]{1,64}$/;
/** At most three plain segments below the token (`/oda-servisi`, `/mybar`, `/siparis/{id}`). */
const SUB_PATH = /^(\/[A-Za-z0-9_-]{1,64}){1,3}$/;

/** `/api/q/{token}/lang?lang=xx[&from=/q/{token}/…]`: `pathname` is the page the guest is on. */
export function guestLangHref(token: string, code: string, pathname?: string | null): string {
  const base = `/api/q/${encodeURIComponent(token)}/lang?lang=${code}`;
  const home = `/q/${token}`;
  return pathname && pathname !== home && pathname === guestLangBackPath(token, pathname)
    ? `${base}&from=${encodeURIComponent(pathname)}`
    : base;
}

/**
 * Where the lang route redirects. Only the token's own pages are accepted (no open redirect); anything
 * else answers the token's home page, and `/` for a malformed token.
 */
export function guestLangBackPath(token: string, from?: string | null): string {
  if (!TOKEN_FORMAT.test(token)) return "/";
  const home = `/q/${token}`;
  if (from && from.startsWith(`${home}/`) && SUB_PATH.test(from.slice(home.length))) return from;
  return home;
}
