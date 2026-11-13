import { appForPath } from "./frameAppLinks";
import type { AppDefinition } from "./registry";
import { appVisibleInHotel, MAX_WINDOWS, type createWindowStore } from "./windowStore";

type Store = ReturnType<typeof createWindowStore>;

export type FramePathOutcome =
  | { result: "opened"; windowId: string }
  | { result: "denied"; reason: "permission" | "limit"; title: string }
  | { result: "unknown" };

/**
 * The desktop shell's answer to a link clicked inside a window's page (frameAppLinks): when `href` is the first
 * screen of a program, that program's window comes to front (one already open for the same hotel) or is opened,
 * under the same rules as an icon: the user's program list and the hotel's permissions. "unknown" leaves the link
 * to the page (a sub-page of the window, not a program).
 */
export function openFramePath(store: Store, apps: readonly AppDefinition[], href: string, origin: string): FramePathOutcome {
  let url: URL;
  try {
    url = new URL(href, origin);
  } catch {
    return { result: "unknown" };
  }
  if (url.origin !== origin) return { result: "unknown" };
  const app = appForPath(apps, url.pathname);
  if (!app) return { result: "unknown" };
  const title = app.launchLabel ?? app.title;
  const state = store.getState();
  const hotelId = url.searchParams.get("hotelId") || undefined;
  const listed = state.appIds === null || state.appIds.includes(app.id);
  const inHotel = !hotelId || appVisibleInHotel(state, app, hotelId);
  if (!listed || !inHotel) return { result: "denied", reason: "permission", title };

  const existing = state.order
    .map((id) => state.windows[id])
    .find((w) => w && w.appId === app.id && (!hotelId || w.hotelId === hotelId));
  if (existing) {
    state.focus(existing.id);
    return { result: "opened", windowId: existing.id };
  }
  const opened = state.open(app.id, { hotelId });
  if (opened) return { result: "opened", windowId: opened };
  return { result: "denied", reason: state.order.length >= MAX_WINDOWS ? "limit" : "permission", title };
}
