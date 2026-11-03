import { projectName } from "./viewports";

/**
 * Ratchet lists: a key listed here is a KNOWN violation owned by the named task (value "T6" ...).
 * The matrix then asserts the violation STILL exists, so fixing a screen forces its entry out
 * (the lists can only shrink). Task 15 requires all three lists to be empty.
 *
 * Keys are a route key ("kasa") for every viewport, or "<route key>@<project>" for one viewport only.
 */
export const KNOWN_TOUCH_VIOLATIONS: Record<string, string> = {};

export const KNOWN_AXE_VIOLATIONS: Record<string, string> = {};

/** Route/project pairs that scroll horizontally today: "<route key>@<project>". */
export const KNOWN_SCROLL: Record<string, string> = {};

/** `key@project` wins over `key`. */
export function knownFor(list: Record<string, string>, key: string): string | undefined {
  return list[`${key}@${projectName()}`] ?? list[key];
}
