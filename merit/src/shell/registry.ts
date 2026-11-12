import type { ComponentType } from "react";
import type { ModuleKey } from "@/generated/prisma/enums";
import { SCREENS } from "@/modules/core/screens";

/** Start-menu group of an app (spec §5.1). */
export type AppCategory =
  | "GENEL"
  | "RADAR"
  | "OUTLET"
  | "ROOM_SERVICE"
  | "MINIBAR"
  | "SISTEM"
  | "KULLANICI"
  | "QR_MENU"
  | "QR_ORDER"
  | "RAPOR";

/**
 * What the shell passes to an app component (spec §5.2). `setDirty(true)` marks unsaved work: the
 * window then asks before closing.
 */
export type AppProps = {
  hotelId?: string;
  /**
   * Sub-view the opener asked for (`windowStore.open(appId, { initialPanel })`), e.g. a Tanımlamalar
   * tree node. Only the opening request carries it: it is not persisted and a reload shows the
   * app's default view.
   */
  initialPanel?: string;
  /** Outlet selected by the opener; transient just like initialPanel. */
  initialOutletId?: string;
  windowId: string;
  close(): void;
  setStatus(text: string): void;
  setDirty(dirty: boolean): void;
  /** Replaces the window title (the app knows a better one than "<app> · <hotel>", e.g. the radar scope). */
  setTitle?(title: string): void;
  /**
   * Opens another app in a new window (`panel` = the app's `initialPanel`, e.g. a Tanımlamalar tree
   * node). Does nothing for an app the user may not open; at the window limit it says so.
   */
  openApp(appId: string, opts?: { hotelId?: string; panel?: string; outletId?: string }): void;
};

/** App registration contract (spec §5.2). Modules add their apps with registerApp(). */
export type AppDefinition = {
  id: string; // 'minibar.oda-kontrol'
  title: string;
  /** Shortcut label for a distinct tool that shares another app's permission screen. */
  launchLabel?: string;
  icon: string; // XP icon set key (shell/icons.tsx)
  moduleKey: ModuleKey | "CORE";
  screenCode: string; // AppScreen.code: visibility follows this permission
  /** Also limited to these session role codes (a tool whose server side authorizes by role, not by screen). */
  roleCodes?: readonly string[];
  /**
   * Offered to these session role codes even without the screen permission. Only for a window whose content
   * is personal (Denetim Masası → Görünüm); whatever else the window holds must authorise itself on the server.
   */
  alwaysForRoleCodes?: readonly string[];
  /** Never offered to these session role codes, whatever the screen permission says. */
  hiddenForRoleCodes?: readonly string[];
  category: AppCategory;
  needsHotel: boolean; // asks for a hotel context inside the window
  window: { w: number; h: number; minW?: number; minH?: number; resizable?: boolean };
  kind: "component" | "iframe";
  component?: () => Promise<{ default: ComponentType<AppProps> }>; // lazy
  url?: string; // iframe kind (future external web apps)
  external?: { href: string };
  mobile?: "none" | "readonly" | "full";
};

const apps = new Map<string, AppDefinition>();

/** Adds or replaces (same id) an app. Insertion order is the display order. */
export function registerApp(def: AppDefinition): void {
  apps.set(def.id, def);
}

export function screenName(code: string): string | undefined {
  return SCREENS.find((screen) => screen.code === code)?.name;
}

export function registerCatalogApp(def: AppDefinition): void {
  const title = screenName(def.screenCode) ?? def.title;
  registerApp({ ...def, title });
}

export function getApps(): AppDefinition[] {
  return [...apps.values()];
}

export function getApp(id: string): AppDefinition | undefined {
  return apps.get(id);
}
