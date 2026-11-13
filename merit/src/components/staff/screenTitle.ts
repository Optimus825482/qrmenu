import { SCREENS } from "@/modules/core/screens";

/**
 * Title of a page that is a catalogue screen: the screen's catalogue name (single source of the names, E2).
 * An unknown code is returned as it is, so a typo shows on screen instead of hiding.
 */
export function screenTitle(code: string): string {
  return SCREENS.find((s) => s.code === code)?.name ?? code;
}
