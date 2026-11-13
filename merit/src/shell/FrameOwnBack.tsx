"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

/** A page's own back control: a link or button led by the back arrow (BackLink, "← Geri"). */
const OWN_BACK = 'a > svg[data-icon="arrow-left"], button > svg[data-icon="arrow-left"]';

/** Whether a page shows a back control of its own: hidden ones (`[hidden]`, inside a closed part) do not count. */
export function hasOwnBack(doc: Pick<Document, "querySelectorAll">): boolean {
  for (const icon of doc.querySelectorAll(OWN_BACK)) {
    if (!icon.closest("[hidden], [aria-hidden='true'] a, [aria-hidden='true'] button")) return true;
  }
  return false;
}

/**
 * Inside a tablet-shell window: tells the shell whether the page on screen has a back control of its own.
 * The shell's app bar hides its arrow then (mobile.css, `data-page-back`), so a screen never shows two
 * "back" arrows one under the other. The page's first screen has none, so the app bar keeps its arrow there.
 * Renders nothing; a page opened directly (no frame) is left alone.
 */
export function FrameOwnBack() {
  const pathname = usePathname();
  useEffect(() => {
    let host: Element | null = null;
    try {
      host = window.frameElement?.closest("[data-app-screen]") ?? null;
    } catch {
      return; // a parent the page may not read
    }
    if (!host) return;
    const mark = () => host.toggleAttribute("data-page-back", hasOwnBack(document));
    mark();
    // Headers that appear after the data arrives are caught as they are drawn (and controls shown / hidden later).
    const observer = new MutationObserver(mark);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["hidden"] });
    return () => {
      observer.disconnect();
      host.removeAttribute("data-page-back");
    };
  }, [pathname]);
  return null;
}

type NavigationEntry = { url?: string | null; key?: string };
type NavigationLike = {
  currentEntry?: { index?: number } | null;
  entries?: () => NavigationEntry[];
  traverseTo?: (key: string) => unknown;
};

/** How far back the page looked for is searched: the list a floor was opened from is one or two entries away
 *  (a redirect that re-adds the window's marks can leave an entry of its own in between). */
const LOOK_BACK = 3;

/**
 * For a page's own "back" link: when the page it leads to is one the user just came from, go back to that
 * history entry instead of adding a new one. Otherwise "Katlar" left the floor ahead in history and the
 * shell's (or the tablet's) back button led straight into it again. Returns true when it went back; the caller
 * then cancels the link. A hotel named by the link must match, so going back never lands on another hotel's list.
 * The Navigation API answers for this frame alone; without it the link is followed as written.
 */
export function stepBackIfPrevious(href: string): boolean {
  if (typeof window === "undefined") return false;
  const nav = (window as unknown as { navigation?: NavigationLike }).navigation;
  const index = nav?.currentEntry?.index;
  const entries = nav?.entries?.();
  if (typeof index !== "number" || !entries || typeof nav?.traverseTo !== "function") return false;
  const key = previousEntryKey(entries, index, href, window.location.origin);
  if (!key) return false;
  nav.traverseTo(key);
  return true;
}

/**
 * The pure part of `stepBackIfPrevious`: the key of the nearest earlier entry (at most LOOK_BACK steps) that shows
 * the page `href` leads to: same path; the hotel is compared only when both addresses name one (a page whose data
 * has not arrived yet links without it, and goes back to the page it was opened from, which is this window's hotel).
 */
export function previousEntryKey(
  entries: readonly NavigationEntry[],
  index: number,
  href: string,
  origin: string,
): string | null {
  let to: URL;
  try {
    to = new URL(href, origin);
  } catch {
    return null;
  }
  for (let i = index - 1; i >= Math.max(0, index - LOOK_BACK); i--) {
    const entry = entries[i];
    if (!entry?.url || !entry.key) continue;
    try {
      const from = new URL(entry.url);
      if (from.origin !== to.origin || from.pathname !== to.pathname) continue;
      const wanted = to.searchParams.get("hotelId");
      const had = from.searchParams.get("hotelId");
      if (wanted && had && had !== wanted) continue;
    } catch {
      continue;
    }
    return entry.key;
  }
  return null;
}
