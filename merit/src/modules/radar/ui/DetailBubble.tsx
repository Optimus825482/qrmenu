"use client";

import type { ReactNode } from "react";
import { getApps } from "@/shell/registry";
import { windowStore } from "@/shell/windowStore";

/**
 * Resolves the registered shell app ID for a target `screenCode` (or prefix) only if that app
 * is visible to the current user in `hotelId`.
 */
export function resolveOpenableAppId(
  target: { screenCode?: string; modulePrefix?: "minibar." | "order." | "rs." | "core."; fallbackAppId?: string },
  hotelId?: string,
): string | undefined {
  const state = windowStore.getState();
  const isAllowed = (appId: string, screenCode: string): boolean => {
    if (state.appIds !== null && !state.appIds.includes(appId)) return false;
    if (
      hotelId &&
      hotelId !== "ALL" &&
      state.screensByHotel !== null &&
      !(state.screensByHotel[hotelId] ?? []).includes(screenCode)
    ) {
      return false;
    }
    return true;
  };

  const allApps = getApps();
  if (target.fallbackAppId) {
    const direct = allApps.find((a) => a.id === target.fallbackAppId);
    if (direct && isAllowed(direct.id, direct.screenCode)) return direct.id;
  }
  if (target.screenCode) {
    const byScreen = allApps.find(
      (a) =>
        a.screenCode === target.screenCode &&
        (!target.modulePrefix || a.id.startsWith(target.modulePrefix)) &&
        isAllowed(a.id, a.screenCode),
    );
    if (byScreen) return byScreen.id;
  }
  if (target.modulePrefix) {
    const byPrefix = allApps.find((a) => a.id.startsWith(target.modulePrefix!) && isAllowed(a.id, a.screenCode));
    if (byPrefix) return byPrefix.id;
  }
  return undefined;
}

export type DetailBubbleProps = {
  title: string;
  ariaLabel?: string;
  hotelId?: string;
  appTarget?: { screenCode?: string; modulePrefix?: "minibar." | "order." | "rs." | "core."; fallbackAppId?: string };
  onOpenApp?: (appId: string) => void;
  onClose(): void;
  children: ReactNode;
};

/**
 * Read-only detail panel / bubble for a room, table or room-service order (Task 9).
 * Renders "Uygulamada aç" only when `onOpenApp` is provided AND the target app is permitted for the user.
 */
export function DetailBubble({
  title,
  ariaLabel,
  hotelId,
  appTarget,
  onOpenApp,
  onClose,
  children,
}: DetailBubbleProps) {
  const openableAppId = onOpenApp && appTarget ? resolveOpenableAppId(appTarget, hotelId) : undefined;
  return (
    <section className="rd-panel rd-detail-bubble" aria-label={ariaLabel ?? `${title} ayrıntısı`}>
      <div className="rd-row">
        <h3>{title}</h3>
        <button type="button" className="rd-link" onClick={onClose}>
          Kapat
        </button>
      </div>
      {children}
      {onOpenApp && openableAppId ? (
        <div>
          <button type="button" className="rd-chip" onClick={() => onOpenApp(openableAppId)}>
            Uygulamada aç
          </button>
        </div>
      ) : null}
    </section>
  );
}
