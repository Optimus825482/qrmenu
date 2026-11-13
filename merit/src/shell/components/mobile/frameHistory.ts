/**
 * "Back" inside an app that runs in a frame (Kat Planı → a floor → a room): the page in the frame goes one
 * step back first; only when it is on its first page does the shell peel its own layer.
 */

type FrameWindow = Pick<Window, "location" | "history"> & { navigation?: { canGoBack?: boolean } };

/** Path of an address without query and hash ("/kat?hotelId=x" → "/kat"). */
const pathOf = (url: string): string => url.replace(/[?#].*$/, "").replace(/\/+$/, "") || "/";

/**
 * Whether the page in the frame has an earlier page of its own. The Navigation API answers for the frame
 * alone (Chrome, the staff tablets); without it, a frame that left the address it was opened with has one.
 */
export function frameCanGoBack(win: FrameWindow, openedWith: string): boolean {
  const own = win.navigation?.canGoBack;
  if (typeof own === "boolean") return own;
  return pathOf(win.location.pathname) !== pathOf(openedWith);
}

/** Steps the frame's page back; false when it is on its first page (or cannot be reached). */
export function stepBackInFrame(frame: HTMLIFrameElement | null | undefined): boolean {
  if (!frame) return false;
  try {
    const win = frame.contentWindow as (Window & FrameWindow) | null;
    if (!win || !frameCanGoBack(win, frame.getAttribute("src") ?? "")) return false;
    win.history.back();
    return true;
  } catch {
    return false; // a frame the shell may not read: the shell's own back applies
  }
}
