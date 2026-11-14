/** How long the "Sistem güncellendi" notice stays once somebody is at the device (or, on a wall screen, in total). */
export const UPDATED_NOTICE_AFTER_SEEN_MS = 20_000;

/**
 * True when the "Sistem güncellendi" notice should close by itself (pure).
 * A page that reloaded itself while nobody was there (tablet on the counter, app in the background) keeps the
 * notice until somebody touches the device, then for a short while more: otherwise it is gone before anyone
 * reads it. A wall screen has nobody to press "Tamam", so there it closes on a plain timer.
 */
export function updatedNoticeShouldClose(p: {
  /** Time since the notice appeared. */
  shownForMs: number;
  /** Time since the first touch / key press after the notice appeared; null while nobody has been there. */
  sinceSeenMs: number | null;
  /** Wall screen (/radar): nobody is expected to interact. */
  unattendedScreen: boolean;
}): boolean {
  if (p.unattendedScreen) return p.shownForMs >= UPDATED_NOTICE_AFTER_SEEN_MS;
  return p.sinceSeenMs !== null && p.sinceSeenMs >= UPDATED_NOTICE_AFTER_SEEN_MS;
}
