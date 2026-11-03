"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type RefObject } from "react";
import { LogoutButton } from "@/components/LogoutButton";
import { APP_FOLDERS } from "../appFolders";
import { XpIcon } from "../icons";
import type { AppDefinition } from "../registry";
import { usePwaInstall } from "../usePwaInstall";
import { useWindowStore } from "../windowStore";

export const APP_DRAG_TYPE = "text/merit-app";

type Props = {
  open: boolean;
  apps: AppDefinition[];
  userName: string;
  onOpenApp(appId: string): void;
  onHelp(): void;
  onClose(): void;
  startButtonRef: RefObject<HTMLButtonElement | null>;
};

export function StartMenu({ open, ...props }: Props) {
  return open ? <StartPanel {...props} /> : null;
}

function StartPanel({ apps, userName, onOpenApp, onHelp, onClose, startButtonRef }: Omit<Props, "open">) {
  const panelRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const programButton = useRef<HTMLButtonElement>(null);
  const folderButton = useRef<HTMLButtonElement | null>(null);
  const [query, setQuery] = useState("");
  const [programs, setPrograms] = useState(false);
  const [folder, setFolder] = useState<string>();
  const recent = useWindowStore((s) => s.recentApps);
  const icons = useWindowStore((s) => s.icons);
  const { canInstall, promptInstall } = usePwaInstall();
  const available = apps.filter((app) => !app.id.startsWith("folder."));
  const lookup = (id: string) => available.find((app) => app.id === id);
  const pinned = icons.map(({ appId }) => lookup(appId)).filter((app) => app !== undefined);
  const search = query.trim().toLocaleLowerCase("tr-TR");
  const matches = search ? available.filter((app) =>
    [app.launchLabel ?? app.title, app.screenCode].some((value) => value.toLocaleLowerCase("tr-TR").includes(search)),
  ) : [];
  const activeFolder = APP_FOLDERS.find(({ id }) => id === folder);

  useEffect(() => {
    searchRef.current?.focus();
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!panelRef.current?.contains(target) && !startButtonRef.current?.contains(target)) onClose();
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [onClose, startButtonRef]);

  const choose = (appId: string) => {
    onClose();
    onOpenApp(appId);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (event.key === "Escape" || (event.key === "ArrowLeft" && target.closest("[data-submenu]"))) {
      event.preventDefault();
      event.stopPropagation();
      if (folder) {
        setFolder(undefined);
        folderButton.current?.focus();
      } else if (programs) {
        setPrograms(false);
        programButton.current?.focus();
      } else {
        onClose();
        startButtonRef.current?.focus();
      }
      return;
    }
    if (event.key === "ArrowRight" && target.matches("[aria-haspopup=menu]")) {
      event.preventDefault();
      target.click();
      return;
    }
    const scope = target.closest("[data-submenu]") ?? panelRef.current;
    const items = [...(scope?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([aria-disabled=true]), .xp-start-logout') ?? [])];
    if (event.key === "Enter" && target === searchRef.current && search) {
      event.preventDefault();
      if (matches[0]) choose(matches[0].id);
      return;
    }
    if (!["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
    if (target === searchRef.current && ["Home", "End"].includes(event.key)) return;
    const index = items.indexOf(target);
    const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1
      : event.key === "ArrowDown" ? (index + 1) % items.length : (index < 0 ? items.length - 1 : (index - 1 + items.length) % items.length);
    if (!items[next]) return;
    event.preventDefault();
    items[next].focus();
  };

  const item = (app: AppDefinition) => (
    <button
      key={app.id}
      type="button"
      role="menuitem"
      className="xp-start-item"
      data-app-id={app.id}
      draggable
      onDragStart={(event) => {
        event.dataTransfer.setData(APP_DRAG_TYPE, app.id);
        event.dataTransfer.effectAllowed = "copy";
      }}
      onDragEnd={onClose}
      onClick={() => choose(app.id)}
    >
      <XpIcon name={app.icon} size={24} />
      {app.launchLabel ?? app.title}
    </button>
  );

  const closeAnd = (action: () => void) => {
    onClose();
    action();
  };

  return (
    <div id="xp-start-menu" ref={panelRef} className="xp-start" onKeyDown={onKeyDown}>
      <div className="xp-start-header">
        <span className="xp-start-avatar" aria-hidden="true"><XpIcon name="online" size={28} /></span>
        {userName}
      </div>
      <input
        ref={searchRef}
        type="search"
        className="xp-start-search"
        aria-label="Uygulama ara"
        placeholder="Uygulama veya ekran kodu ara"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setPrograms(false);
          setFolder(undefined);
        }}
      />
      <div aria-live="polite">
        {search && !matches.length ? <p className="xp-start-group">Uygulama bulunamadı.</p> : null}
      </div>
      <div className="xp-start-columns">
        <div className="xp-start-left" role="menu" aria-label="Başlat menüsü">
          {search ? (
            <div role="group" aria-label="Arama sonuçları">
              {matches.map(item)}
            </div>
          ) : (
            <>
              <div role="group" aria-label="Son kullanılanlar">
                <div className="xp-start-group" aria-hidden="true">Son kullanılanlar</div>
                {recent.map(lookup).filter((app) => app !== undefined).map(item)}
              </div>
              <div role="group" aria-label="Sabitlenenler">
                <div className="xp-start-group" aria-hidden="true">Sabitlenenler</div>
                {pinned.filter((app) => !recent.includes(app.id)).map(item)}
              </div>
              <button ref={programButton} type="button" role="menuitem" className="xp-start-item" aria-haspopup="menu" aria-expanded={programs} onClick={() => {
                setPrograms(!programs);
                setFolder(undefined);
              }}>
                Tüm Programlar <span aria-hidden="true">▸</span>
              </button>
              {programs ? (
                <div role="menu" aria-label="Tüm Programlar" data-submenu="" className="xp-start-submenu">
                  {APP_FOLDERS.map(({ id, label }) => (
                    <button key={id} type="button" role="menuitem" className="xp-start-item" aria-haspopup="menu" aria-expanded={folder === id} onClick={(event) => {
                      folderButton.current = event.currentTarget;
                      setFolder(folder === id ? undefined : id);
                    }}>
                      <XpIcon name="klasor" size={20} />{label}<span aria-hidden="true">▸</span>
                    </button>
                  ))}
                  {activeFolder ? (
                    <div role="menu" aria-label={activeFolder.label} data-submenu="" className="xp-start-submenu">
                      {available.filter((app) => activeFolder.categories.includes(app.category)).map(item)}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </>
          )}
        </div>
        <div className="xp-start-right">
          <div role="menu" aria-label="Sistem kısayolları">
            {[lookup("core.erisimim"), lookup("core.ayarlar")].filter((app) => app !== undefined).map(item)}
            <button type="button" role="menuitem" className="xp-start-item" onClick={() => closeAnd(onHelp)}>
              <XpIcon name="rehber" size={24} />Yardım ve Destek
            </button>
            {canInstall ? (
              <button type="button" role="menuitem" className="xp-start-item" onClick={() => closeAnd(() => { void promptInstall(); })}>
                <XpIcon name="pencere" size={24} />Uygulama olarak yükle
              </button>
            ) : null}
          </div>
          <div className="xp-start-logout-wrap"><LogoutButton className="xp-start-logout" /></div>
        </div>
      </div>
    </div>
  );
}
