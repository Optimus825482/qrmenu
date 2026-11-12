import { XP_ANDROID_MAX_HEIGHT, XP_ANDROID_MAX_WIDTH } from "./resolveShell";

/**
 * Which device the management shell is drawn for: an Android phone, an Android tablet or the XP desktop.
 * Pure, so the rule is testable without a browser.
 *
 * - A narrow (< 760 px) or short (< 500 px, a phone on its side) window is a phone, whatever the pointer.
 * - A wider window whose primary pointer is a finger (`pointer: coarse`) is a tablet.
 * - Everything else (mouse or trackpad) is a desktop/laptop. A touch-screen laptop still reports a fine
 *   primary pointer, so it keeps the desktop.
 */
export type DeviceForm = "phone" | "tablet" | "desktop";

export type DeviceFormInput = {
  width: number;
  height: number;
  /** `matchMedia("(pointer: coarse)")`: the primary pointer is a finger. */
  coarsePointer: boolean;
  /**
   * The browser says it runs on a phone/tablet OS. A tablet with a mouse or keyboard cover reports a fine
   * primary pointer; without this it would be handed the XP desktop, which has no way back.
   */
  handheld?: boolean;
  /** `?cihaz=telefon|tablet|masaustu`: forces a form (support and testing on a PC). */
  query?: string | null;
};

const QUERY_FORMS: Record<string, DeviceForm> = { telefon: "phone", tablet: "tablet", masaustu: "desktop" };

/** The `?cihaz=` override, or null when absent/unknown. */
export function parseFormQuery(params: URLSearchParams): DeviceForm | null {
  return QUERY_FORMS[params.get("cihaz") ?? ""] ?? null;
}

/**
 * Server-side guess from the User-Agent, used only for the first paint (the browser's own reading replaces
 * it after hydration): a handheld gets the Android layout, anything else the desktop.
 */
export function formFromUserAgent(userAgent: string | null | undefined): DeviceForm {
  return /Android|iPhone|iPad|iPod|Mobile/i.test(userAgent ?? "") ? "phone" : "desktop";
}

/** Android, iOS and iPadOS (which calls itself a Mac but has a multi-touch screen). */
export function isHandheld(userAgent: string, platform: string, maxTouchPoints: number): boolean {
  return /Android|iPhone|iPad|iPod/i.test(userAgent) || (/Mac/i.test(platform) && maxTouchPoints > 1);
}

export function resolveDeviceForm(input: DeviceFormInput): DeviceForm {
  const forced = input.query ? QUERY_FORMS[input.query] : undefined;
  if (forced) return forced;
  if (input.width < XP_ANDROID_MAX_WIDTH || input.height < XP_ANDROID_MAX_HEIGHT) return "phone";
  return input.coarsePointer || input.handheld ? "tablet" : "desktop";
}
