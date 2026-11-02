"use client";

import { useEffect, useRef, type KeyboardEvent, type RefObject } from "react";
import { LogoutButton } from "@/components/LogoutButton";
import { XpIcon } from "../icons";
import type { AppCategory, AppDefinition } from "../registry";
import { usePwaInstall } from "../usePwaInstall";

/** Start-menu groups in display order (spec §5.1). */
const CATEGORIES: { key: AppCategory; label: string }[] = [
  { key: "OUTLET", label: "OUTLET OPERASYONLARI" },
  { key: "ROOM_SERVICE", label: "ODA SERVİSİ OPERASYONLARI" },
  { key: "MINIBAR", label: "MİNİBAR OPERASYONLARI" },
  { key: "SISTEM", label: "SİSTEM YÖNETİMİ" },
  { key: "KULLANICI", label: "KULLANICI YÖNETİMİ" },
  { key: "GENEL", label: "GENEL" },
  { key: "QR_MENU", label: "QR MENÜ" },
  { key: "QR_ORDER", label: "QR SİPARİŞ" },
  { key: "RAPOR", label: "RAPORLAR" },
];

/** App opened by the right column's "Denetim Masası" entry. */
const SETTINGS_APP_ID = "core.ayarlar";

export const APP_DRAG_TYPE = "text/merit-app";

type Props = {
  open: boolean;
  /** Only the apps the user may see. */
  apps: AppDefinition[];
  userName: string;
  onOpenApp(appId: string): void;
  onClose(): void;
  startButtonRef: RefObject<HTMLButtonElement | null>;
};

export function StartMenu({ open, apps, userName, onOpenApp, onClose, startButtonRef }: Props) {
  if (!open) return null;
  return (
    <StartPanel
      apps={apps}
      userName={userName}
      onOpenApp={onOpenApp}
      onClose={onClose}
      startButtonRef={startButtonRef}
    />
  );
}

function StartPanel({ apps, userName, onOpenApp, onClose, startButtonRef }: Omit<Props, "open">) {
  const panelRef = useRef<HTMLDivElement>(null);
  const latestClose = useRef(onClose);
  useEffect(() => {
    latestClose.current = onClose;
  });

  useEffect(() => {
    panelRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (panelRef.current?.contains(target) || startButtonRef.current?.contains(target)) return;
      latestClose.current();
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [startButtonRef]);

  const choose = (appId: string) => {
    onClose();
    onOpenApp(appId);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
      startButtonRef.current?.focus();
      return;
    }
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    const items = [
      ...(panelRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"], .xp-start-logout') ??
        []),
    ];
    const at = items.indexOf(document.activeElement as HTMLElement);
    const step = e.key === "ArrowDown" ? 1 : -1;
    e.preventDefault();
    items[(at + step + items.length) % items.length]?.focus();
  };

  const groups = CATEGORIES.map((c) => ({
    ...c,
    apps: apps.filter((a) => a.category === c.key && !a.id.startsWith("folder.")),
  })).filter((g) => g.apps.length > 0);
  const settings = apps.find((a) => a.id === SETTINGS_APP_ID);
  const { canInstall, promptInstall } = usePwaInstall();

  const item = (app: AppDefinition, label = app.title) => (
    <button
      key={app.id}
      type="button"
      role="menuitem"
      className="xp-start-item"
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(APP_DRAG_TYPE, app.id);
        e.dataTransfer.effectAllowed = "copy";
      }}
      onDragEnd={onClose}
      onClick={() => choose(app.id)}
    >
      <XpIcon name={app.icon} size={24} />
      {label}
    </button>
  );

  return (
    <div id="xp-start-menu" ref={panelRef} className="xp-start" onKeyDown={onKeyDown}>
      <div className="xp-start-header">
        <span className="xp-start-avatar" aria-hidden="true">
          <XpIcon name="online" size={28} />
        </span>
        {userName}
      </div>
      <div className="xp-start-columns">
        <div className="xp-start-left" role="menu" aria-label="Başlat menüsü">
          {groups.map((g) => (
            <div key={g.key} role="group" aria-label={g.label}>
              <div className="xp-start-group" aria-hidden="true">
                {g.label}
              </div>
              {g.apps.map((a) => item(a))}
            </div>
          ))}
        </div>
        <div className="xp-start-right">
          {settings || canInstall ? (
            <div role="menu" aria-label="Sistem kısayolları">
              {settings ? item(settings) : null}
              {canInstall ? (
                <button
                  type="button"
                  role="menuitem"
                  className="xp-start-item"
                  onClick={() => {
                    onClose();
                    void promptInstall();
                  }}
                >
                  <XpIcon name="pencere" size={24} />
                  Uygulama olarak yükle
                </button>
              ) : null}
            </div>
          ) : null}
          <div className="xp-start-logout-wrap">
            <LogoutButton className="xp-start-logout" />
          </div>
        </div>
      </div>
    </div>
  );
}
