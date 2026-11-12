"use client";

import { useMemo, useSyncExternalStore } from "react";
import { isHandheld, parseFormQuery, resolveDeviceForm, type DeviceForm } from "./deviceForm";
import { DEVICE_EVENT, parseDevice, readDeviceRaw, type DeviceRecord } from "./deviceRecord";
import {
  XP_ANDROID_MAX_WIDTH,
  parseShellQuery,
  resolveShell,
  type ShellDecision,
  type ShellInput,
} from "./resolveShell";

export type ShellMode = "desktop" | "mobile";

/** Narrower windows get the Android shell. */
export const MOBILE_MAX_WIDTH = XP_ANDROID_MAX_WIDTH;

/** What the XP desktop (`/admin`) always resolves against: an admin-kind user viewing a desktop screen. */
const ADMIN_INPUT: Pick<ShellInput, "screen" | "roleKind" | "canUsePos"> = {
  screen: { code: "ADMIN", context: "xp" },
  roleKind: "SISTEM",
  canUsePos: true,
};

function modeOf(decision: ShellDecision): ShellMode {
  return decision.shell === "personel" || decision.layout === "android" ? "mobile" : "desktop";
}

const COARSE_POINTER = "(pointer: coarse)";

/** Non-hook read of the device form (phone / tablet / desktop); only call in the browser. */
export function currentDeviceForm(): DeviceForm {
  return resolveDeviceForm({
    width: window.innerWidth,
    height: window.innerHeight,
    coarsePointer: window.matchMedia?.(COARSE_POINTER).matches === true,
    handheld: isHandheld(navigator.userAgent, navigator.platform ?? "", navigator.maxTouchPoints ?? 0),
    query: new URLSearchParams(window.location.search).get("cihaz"),
  });
}

/** Non-hook read of the mode (for effects and event handlers); only call in the browser. */
export function currentShellMode(): ShellMode {
  const params = new URLSearchParams(window.location.search);
  const query = parseShellQuery(params);
  // `?mobil=1` (= personel) keeps forcing the Android shell on a wide screen. The device record is a
  // kiosk preference for /kasa and /kds and does not apply to the desktop.
  const mode = modeOf(
    resolveShell({ ...ADMIN_INPUT, query, viewportWidth: window.innerWidth, viewportHeight: window.innerHeight }),
  );
  // A tablet (wide window, finger as primary pointer) gets the Android shell too, in its tablet layout.
  // An explicit `?mod=xp` or `?cihaz=masaustu` keeps the desktop.
  if (mode === "desktop" && query !== "xp") {
    const form = parseFormQuery(params) ?? currentDeviceForm();
    if (form !== "desktop") return "mobile";
  }
  return mode;
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener("resize", onChange);
  window.addEventListener("popstate", onChange);
  // Docking a mouse or keyboard changes the primary pointer without a resize.
  const pointer = window.matchMedia?.(COARSE_POINTER);
  pointer?.addEventListener?.("change", onChange);
  return () => {
    window.removeEventListener("resize", onChange);
    window.removeEventListener("popstate", onChange);
    pointer?.removeEventListener?.("change", onChange);
  };
}

/**
 * Which shell to show: the Android shell when the window is narrower than 760 px, shorter than
 * 500 px (a phone turned to landscape) or the URL has
 * `?mobil=1` (to try it on a wide screen), the XP desktop otherwise. A thin client wrapper around the
 * pure `resolveShell`. The server (and the hydration pass) always render 'desktop'; the real value
 * follows right after hydration and on resize.
 */
export function useShellMode(): ShellMode {
  return useSyncExternalStore(subscribe, currentShellMode, () => "desktop");
}

/**
 * Layout of the Android shell: "phone" or "tablet". Inside the Android shell a "desktop" reading (the
 * shell was forced with `?mod=personel` on a PC) is drawn as a tablet when the window is wide enough.
 */
export function useAndroidForm(): "phone" | "tablet" {
  const form = useSyncExternalStore(subscribe, currentDeviceForm, () => "phone" as DeviceForm);
  return form === "phone" ? "phone" : "tablet";
}

/**
 * Device form for shells outside the admin desktop (staff pages). `hint` is the server's User-Agent guess
 * and is what the first paint uses, so a PC does not flash the Android layout before hydration.
 */
export function useDeviceForm(hint: DeviceForm): DeviceForm {
  return useSyncExternalStore(subscribe, currentDeviceForm, () => hint);
}

function subscribeAll(onChange: () => void): () => void {
  window.addEventListener("resize", onChange);
  window.addEventListener("popstate", onChange);
  window.addEventListener("storage", onChange);
  window.addEventListener(DEVICE_EVENT, onChange);
  return () => {
    window.removeEventListener("resize", onChange);
    window.removeEventListener("popstate", onChange);
    window.removeEventListener("storage", onChange);
    window.removeEventListener(DEVICE_EVENT, onChange);
  };
}

/** A primitive snapshot (width, query, device record) so `useSyncExternalStore` compares by value. */
function browserSnapshot(): string {
  return JSON.stringify([window.innerWidth, window.location.search, readDeviceRaw()]);
}

const SERVER_SNAPSHOT = JSON.stringify([null, "", ""]);

export type ShellContext = Omit<ShellInput, "query" | "device" | "viewportWidth">;

export type ResolvedShell = ShellDecision & {
  /** The stored device record (null on the server, before hydration, or when unreadable). */
  device: DeviceRecord | null;
  /** False during the server render / hydration pass: the decision then ignores width, query and device. */
  hydrated: boolean;
};

/**
 * Shell decision of a staff/POS page (`OpsShell`): the server supplies role kind, whether POS is allowed
 * and the user's preference; the browser adds the URL query, the device record and the window width.
 * Server and hydration pass decide with width `null`, so markup matches and the real choice follows.
 */
export function useResolvedShell(context: ShellContext): ResolvedShell {
  const snapshot = useSyncExternalStore(subscribeAll, browserSnapshot, () => SERVER_SNAPSHOT);
  const { roleKind, canUsePos, preferred } = context;
  const screenCode = context.screen.code;
  const screenContext = context.screen.context;
  return useMemo(() => {
    const [width, search, rawDevice] = JSON.parse(snapshot) as [number | null, string, string];
    const device = parseDevice(rawDevice);
    const decision = resolveShell({
      screen: { code: screenCode, context: screenContext },
      roleKind,
      canUsePos,
      preferred,
      query: parseShellQuery(new URLSearchParams(search)),
      device,
      viewportWidth: width,
    });
    return { ...decision, device, hydrated: width !== null };
  }, [snapshot, screenCode, screenContext, roleKind, canUsePos, preferred]);
}
