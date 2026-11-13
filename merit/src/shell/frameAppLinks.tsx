"use client";

import { useEffect } from "react";
import type { AppDefinition } from "./registry";

/**
 * Links between programs inside a shell window. A page in a window's frame (/kat, /depo …) links to other screens;
 * when such a link leads to a screen that is a program of its own (Otel Deposu, Minibar Raporları …), the shell
 * opens that program's window instead of loading the page into the window that was clicked: the window's title,
 * its hotel selector and its permission stay the ones of the program it was opened as.
 *
 * The shell installs a bridge on its own `window`; the page (same origin) asks it on every link click.
 */
export type FramePathResult =
  /** The program's window was opened or brought to front: the page cancels the link. */
  | "opened"
  /** The link leads to a program the user may not open (or no window is left): the page cancels the link. */
  | "denied"
  /** Not a program: the page follows the link inside its own window. */
  | "unknown";

type Bridge = (href: string) => FramePathResult;

const BRIDGE_KEY = "__meritOpenFramePath";

type BridgeHost = { [BRIDGE_KEY]?: Bridge };

/** Path without a trailing slash ("/depo/stok/" → "/depo/stok"). */
export function normalPath(pathname: string): string {
  return pathname.replace(/\/+$/, "") || "/";
}

/** The frame program (`kind: "iframe"`) whose first screen is the page behind `pathname`. */
export function appForPath<T extends Pick<AppDefinition, "kind" | "url">>(
  apps: readonly T[],
  pathname: string,
): T | undefined {
  const path = normalPath(pathname);
  return apps.find((a) => a.kind === "iframe" && typeof a.url === "string" && normalPath(a.url.replace(/[?#].*$/, "")) === path);
}

/** The shell side: answers the pages' link clicks until the returned cleanup runs. */
export function installFrameBridge(bridge: Bridge): () => void {
  const host = window as unknown as BridgeHost;
  host[BRIDGE_KEY] = bridge;
  return () => {
    if (host[BRIDGE_KEY] === bridge) delete host[BRIDGE_KEY];
  };
}

/** The address the shell window opened this frame with; "" outside a frame. */
function frameSrcPath(): string {
  try {
    const src = window.frameElement?.getAttribute("src");
    return src ? normalPath(new URL(src, window.location.origin).pathname) : "";
  } catch {
    return "";
  }
}

/**
 * What a click on a link to `target` does inside a shell window (pure): "follow" loads it in this window. A link
 * to the window's own first screen, or to the page on screen, is never handed to the shell.
 */
export function decideFrameLink(input: {
  target: URL;
  origin: string;
  currentPath: string;
  frameSrcPath: string;
  currentHotelId: string;
}): { action: "follow" } | { action: "ask"; href: string } {
  const { target } = input;
  if (target.origin !== input.origin) return { action: "follow" };
  const path = normalPath(target.pathname);
  if (path === normalPath(input.currentPath) || path === input.frameSrcPath) return { action: "follow" };
  const params = new URLSearchParams(target.search);
  // The new window shows the hotel this window shows, unless the link names one.
  if (!params.has("hotelId") && input.currentHotelId) params.set("hotelId", input.currentHotelId);
  const qs = params.toString();
  return { action: "ask", href: qs ? `${path}?${qs}` : path };
}

/**
 * The page side, rendered by the /kat and /depo layouts inside a shell window. Renders nothing; a page opened
 * directly (no frame, no bridge) keeps its links as they are.
 */
export function FrameAppLinks() {
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
      if (!anchor || anchor.hasAttribute("download") || (anchor.target && anchor.target !== "_self")) return;
      let bridge: Bridge | undefined;
      try {
        if (window.parent === window) return;
        bridge = (window.parent as unknown as BridgeHost)[BRIDGE_KEY];
      } catch {
        return; // a parent the page may not read
      }
      if (!bridge) return;
      let target: URL;
      try {
        target = new URL(anchor.href, window.location.href);
      } catch {
        return;
      }
      const decision = decideFrameLink({
        target,
        origin: window.location.origin,
        currentPath: window.location.pathname,
        frameSrcPath: frameSrcPath(),
        currentHotelId: new URLSearchParams(window.location.search).get("hotelId") ?? "",
      });
      if (decision.action === "follow") return;
      if (bridge(decision.href) === "unknown") return;
      event.preventDefault();
      event.stopPropagation();
    };
    // Capture on the document: before the link's own handler and the router see the click.
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);
  return null;
}
