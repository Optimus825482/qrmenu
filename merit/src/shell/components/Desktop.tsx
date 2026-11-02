"use client";

import { useRouter } from "next/navigation";
import {
  useRef,
  useState,
  type DragEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { alertDialog, confirm, confirmRemoveShortcut } from "../confirm";
import { XpIcon } from "../icons";
import type { AppDefinition } from "../registry";
import { WALLPAPER_LABELS, type IconPos } from "../types";
import {
  deskHeight,
  effectiveViewport,
  ICON_CELL_H,
  ICON_CELL_W,
  useWindowStore,
  WALLPAPERS,
  windowStore,
} from "../windowStore";
import { BrandWatermark } from "./BrandWatermark";
import { ContextMenu, type MenuItem } from "./ContextMenu";
import { APP_DRAG_TYPE } from "./StartMenu";

const CATEGORY_LABEL: Record<AppDefinition["category"], string> = {
  GENEL: "Genel",
  OUTLET: "Outlet Operasyonları",
  ROOM_SERVICE: "Oda Servisi Operasyonları",
  MINIBAR: "Minibar Operasyonları",
  SISTEM: "Sistem Yönetimi",
  KULLANICI: "Kullanıcı Yönetimi",
  QR_MENU: "QR Menü Operasyonları",
  QR_ORDER: "QR Sipariş Operasyonları",
  RAPOR: "Raporlar",
};

/** Pointer travel (px) before a press on an icon becomes a drag. */
const DRAG_THRESHOLD = 4;

type MenuState = { x: number; y: number; appId?: string };

type Props = {
  /** Only the apps the user may see. */
  apps: AppDefinition[];
  onOpenApp(appId: string): void;
};

/** Wallpaper, shortcut icons, right-click menus and drops from the Start menu. */
export function Desktop({ apps, onOpenApp }: Props) {
  const router = useRouter();
  const wallpaper = useWindowStore((s) => s.wallpaper);
  const icons = useWindowStore((s) => s.icons);
  const brandWatermark = useWindowStore((s) => s.brandWatermark);
  const [selected, setSelected] = useState<string | null>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const appById = new Map(apps.map((a) => [a.id, a]));

  const menuAt = (e: ReactMouseEvent, appId?: string): MenuState => {
    // A keyboard-invoked context menu (Shift+F10, Menu key) carries no pointer position.
    if (e.clientX === 0 && e.clientY === 0) {
      const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
      return { x: r.left + 16, y: r.top + 16, appId };
    }
    return { x: e.clientX, y: e.clientY, appId };
  };

  const onDragOver = (e: DragEvent<HTMLDivElement>) => {
    if (!e.dataTransfer.types.includes(APP_DRAG_TYPE)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  };

  const onDrop = async (e: DragEvent<HTMLDivElement>) => {
    const appId = e.dataTransfer.getData(APP_DRAG_TYPE);
    if (!appId) return;
    e.preventDefault();
    const app = appById.get(appId);
    if (!app) return;
    const r = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - r.left - ICON_CELL_W / 2;
    const y = e.clientY - r.top - ICON_CELL_H / 3;
    const store = windowStore.getState();
    if (store.icons.some((i) => i.appId === appId)) {
      store.moveIcon(appId, x, y);
      return;
    }
    const yes = await confirm({
      title: "Kısayol oluştur",
      message: `"${app.title}" için masaüstünde kısayol oluşturulsun mu?`,
    });
    if (yes) windowStore.getState().addIcon(appId, x, y);
  };

  const removeShortcut = async (app: AppDefinition) => {
    if (await confirmRemoveShortcut(app.title)) windowStore.getState().removeIcon(app.id);
  };

  const desktopItems = (): MenuItem[] => [
    { label: "Yenile", onSelect: () => router.refresh() },
    {
      label: "Duvar kağıdı",
      submenu: WALLPAPERS.map((w) => ({
        label: WALLPAPER_LABELS[w],
        checked: w === wallpaper,
        onSelect: () => windowStore.getState().setWallpaper(w),
      })),
    },
    { label: "Simgeleri hizala", onSelect: () => windowStore.getState().arrangeIcons() },
    { kind: "separator" },
    {
      label: "Özellikler",
      onSelect: () => {
        const s = windowStore.getState();
        void alertDialog({
          title: "Masaüstü Özellikleri",
          message: `Duvar kağıdı: ${WALLPAPER_LABELS[s.wallpaper]}\nKısayol sayısı: ${s.icons.length}\nAçık pencere: ${s.order.length}`,
        });
      },
    },
  ];

  const iconItems = (app: AppDefinition): MenuItem[] => [
    { label: "Aç", onSelect: () => onOpenApp(app.id) },
    { label: "Kısayolu kaldır", onSelect: () => void removeShortcut(app) },
    { kind: "separator" },
    {
      label: "Özellikler",
      onSelect: () =>
        void alertDialog({
          title: `${app.title} Özellikleri`,
          message: `Uygulama: ${app.title}\nKategori: ${CATEGORY_LABEL[app.category]}\nEkran kodu: ${app.screenCode}\nOtel bağlamı: ${app.needsHotel ? "Evet" : "Hayır"}`,
        }),
    },
  ];

  const menuApp = menu?.appId ? appById.get(menu.appId) : undefined;

  return (
    <div
      className="xp-desktop"
      data-wallpaper={wallpaper}
      role="region"
      aria-label="Masaüstü"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) setSelected(null);
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        if (e.target === e.currentTarget) setMenu(menuAt(e));
      }}
      onDragOver={onDragOver}
      onDrop={(e) => void onDrop(e)}
    >
      {brandWatermark ? <BrandWatermark /> : null}
      {icons.map((icon) => {
        const app = appById.get(icon.appId);
        if (!app) return null;
        return (
          <DesktopIcon
            key={icon.appId}
            icon={icon}
            app={app}
            selected={selected === icon.appId}
            onSelect={() => setSelected(icon.appId)}
            onOpen={() => onOpenApp(app.id)}
            onMenu={(e) => {
              setSelected(icon.appId);
              setMenu(menuAt(e, icon.appId));
            }}
          />
        );
      })}
      {menu ? (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          label={menuApp ? "Simge menüsü" : "Masaüstü menüsü"}
          items={menuApp ? iconItems(menuApp) : desktopItems()}
          onClose={() => setMenu(null)}
        />
      ) : null}
    </div>
  );
}

type IconProps = {
  icon: IconPos;
  app: AppDefinition;
  selected: boolean;
  onSelect(): void;
  onOpen(): void;
  onMenu(e: ReactMouseEvent): void;
};

/**
 * A shortcut: click selects, double-click or Enter opens, drag (pointer events with capture) moves
 * it. While dragging only the element's style changes; the store is updated on release.
 */
function DesktopIcon({ icon, app, selected, onSelect, onOpen, onMenu }: IconProps) {
  const drag = useRef<{
    id: number;
    px: number;
    py: number;
    moved: boolean;
    x: number;
    y: number;
  } | null>(null);

  const onPointerDown = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    onSelect();
    drag.current = { id: e.pointerId, px: e.clientX, py: e.clientY, moved: false, x: icon.x, y: icon.y };
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.px;
    const dy = e.clientY - d.py;
    if (!d.moved) {
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      d.moved = true;
      e.currentTarget.setPointerCapture(e.pointerId);
      e.currentTarget.classList.add("is-dragging");
    }
    const vp = effectiveViewport(windowStore.getState());
    d.x = Math.min(Math.max(0, icon.x + dx), Math.max(0, vp.w - ICON_CELL_W));
    d.y = Math.min(Math.max(0, icon.y + dy), Math.max(0, deskHeight(vp) - ICON_CELL_H));
    e.currentTarget.style.left = `${d.x}px`;
    e.currentTarget.style.top = `${d.y}px`;
  };

  const onPointerUp = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    drag.current = null;
    if (!d?.moved) return;
    e.currentTarget.classList.remove("is-dragging");
    windowStore.getState().moveIcon(app.id, d.x, d.y);
  };

  return (
    <button
      type="button"
      className="xp-desktop-icon"
      data-selected={selected}
      style={{ left: icon.x, top: icon.y }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onDoubleClick={onOpen}
      onFocus={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          onOpen();
        }
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onMenu(e);
      }}
    >
      <XpIcon name={app.icon} size={40} />
      <span className="xp-desktop-icon-label">{app.title}</span>
    </button>
  );
}
