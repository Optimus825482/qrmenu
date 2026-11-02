"use client";

import {
  Component,
  createElement,
  lazy,
  Suspense,
  useCallback,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type LazyExoticComponent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { appFrameUrl } from "../appearance";
import { alertDialog, confirm } from "../confirm";
import { XpIcon } from "../icons";
import { getApp, type AppDefinition, type AppProps } from "../registry";
import {
  clampWindowPosition,
  deskHeight,
  effectiveViewport,
  hotelsForApp,
  MAX_WINDOWS,
  minSize,
  selectActiveId,
  useWindowStore,
  windowStore,
} from "../windowStore";
import { ContextMenu, type MenuItem } from "./ContextMenu";
import { HotelPicker, type HotelInfo } from "./HotelPicker";

const lazyApps = new Map<string, LazyExoticComponent<ComponentType<AppProps>>>();

/** One React.lazy per app id, created once and reused by every window of that app. */
function lazyApp(app: AppDefinition): LazyExoticComponent<ComponentType<AppProps>> | undefined {
  if (!app.component) return undefined;
  let comp = lazyApps.get(app.id);
  if (!comp) {
    comp = lazy(app.component);
    lazyApps.set(app.id, comp);
  }
  return comp;
}

/** Renders the app's lazy component (module-level, so the component identity is stable). */
function AppHost({ app, props }: { app: AppDefinition; props: AppProps }) {
  const comp = lazyApp(app);
  if (!comp) return <div className="xp-app-error">Bu uygulamanın bileşeni yok.</div>;
  return createElement(comp, props);
}

/** iframe apps are same-origin only in P0: a root-relative path ("/x"), never "//host" or a scheme. */
function isSameOriginPath(url: string | undefined): url is string {
  return typeof url === "string" && url.startsWith("/") && !url.startsWith("//") && !url.includes("\\");
}

const MENU_NAMES: MenuName[] = ["Dosya", "Görünüm", "Yardım"];

type MenuName = "Dosya" | "Görünüm" | "Yardım";

type ResizeDirection = "e" | "w" | "s" | "n" | "se" | "sw" | "ne" | "nw";

type Props = { id: string; hotels: HotelInfo[]; userName: string };

/**
 * One XP window: title bar (drag, double-click maximize), min/max/close, menu bar, the app (or the
 * hotel picker first), status bar and a bottom-right resize grip. Drags move the element directly
 * (one style write per animation frame) and commit to the store on release.
 */
export function Window({ id, hotels, userName }: Props) {
  const win = useWindowStore((s) => s.windows[id]);
  const active = useWindowStore((s) => selectActiveId(s) === id);
  const ref = useRef<HTMLElement>(null);
  const menuAnchor = useRef<HTMLElement | null>(null);
  const [status, setStatusText] = useState("Hazır");
  const [reloadKey, setReloadKey] = useState(0);
  const [menu, setMenu] = useState<{ name: MenuName; x: number; y: number } | null>(null);
  const [dirty, setDirty] = useState(false);

  const actions = windowStore.getState();
  // A string selector keeps the snapshot stable between renders (no new array each time).
  const pickableKey = useWindowStore((s) =>
    win
      ? hotelsForApp(s, win.appId)
          .map((h) => h.id)
          .join("|")
      : "",
  );
  const app = win ? getApp(win.appId) : undefined;
  // iframe pages render outside the shell: they follow its font and theme through the URL.
  const fontFamily = useWindowStore((s) => s.fontFamily);
  const theme = useWindowStore((s) => s.theme);

  const requestClose = useCallback(async () => {
    const current = windowStore.getState().windows[id];
    if (!current) return;
    if (dirty) {
      const yes = await confirm({
        title: "Kaydedilmemiş değişiklikler",
        message: `"${current.title}" penceresinde kaydedilmemiş değişiklikler var. Yine de kapatılsın mı?`,
        danger: true, confirmLabel: "Yine de kapat",
      });
      if (!yes) return;
    }
    windowStore.getState().close(id);
  }, [id, dirty]);

  const appProps = useMemo<Omit<AppProps, "hotelId">>(
    () => ({
      windowId: id,
      close: () => windowStore.getState().close(id),
      setStatus: (text: string) => setStatusText(text),
      setDirty: (value: boolean) => setDirty(value),
      openApp: (appId: string, opts?: { hotelId?: string; panel?: string; outletId?: string }) => {
        const store = windowStore.getState();
        const opened = store.open(appId, { hotelId: opts?.hotelId, initialPanel: opts?.panel, initialOutletId: opts?.outletId });
        if (opened === null && store.order.length >= MAX_WINDOWS) {
          void alertDialog({
            title: "Pencere sınırı",
            message: `En fazla ${MAX_WINDOWS} pencere açılabilir. Yenisini açmak için bir pencereyi kapatın.`,
          });
        }
      },
    }),
    [id],
  );

  if (!win || !app) return null;

  const resizable = app.window.resizable !== false;
  const hotel = win.hotelId ? hotels.find((h) => h.id === win.hotelId) : undefined;
  // Only hotels where this app's screen is visible (store: screensByHotel).
  const pickableIds = new Set(pickableKey.split("|"));
  const pickable = hotels.filter((h) => pickableIds.has(h.id));

  const startDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || win.maximized || (e.target as Element).closest("button")) return;
    const el = ref.current;
    if (!el) return;
    e.preventDefault();
    const bar = e.currentTarget;
    bar.setPointerCapture(e.pointerId);
    const vp = effectiveViewport(windowStore.getState());
    const start = { px: e.clientX, py: e.clientY, x: win.x, y: win.y };
    let next = { x: win.x, y: win.y };
    let frame = 0;
    const onMove = (ev: PointerEvent) => {
      const x = start.x + ev.clientX - start.px;
      const y = start.y + ev.clientY - start.py;
      next = clampWindowPosition(x, y, win.w, win.h, vp);
      if (!frame) {
        frame = requestAnimationFrame(() => {
          frame = 0;
          el.style.left = `${next.x}px`;
          el.style.top = `${next.y}px`;
        });
      }
    };
    const onUp = () => {
      cancelAnimationFrame(frame);
      bar.removeEventListener("pointermove", onMove);
      bar.removeEventListener("pointerup", onUp);
      bar.removeEventListener("pointercancel", onUp);
      el.style.left = `${next.x}px`;
      el.style.top = `${next.y}px`;
      windowStore.getState().move(id, next.x, next.y);
    };
    bar.addEventListener("pointermove", onMove);
    bar.addEventListener("pointerup", onUp);
    bar.addEventListener("pointercancel", onUp);
  };

  const startResize = (e: ReactPointerEvent<HTMLDivElement>, dir: ResizeDirection = "se") => {
    if (e.button !== 0) return;
    const el = ref.current;
    if (!el) return;
    e.preventDefault();
    e.stopPropagation();
    const handle = e.currentTarget;
    handle.setPointerCapture(e.pointerId);
    const vp = effectiveViewport(windowStore.getState());
    const min = minSize(app);
    const start = { px: e.clientX, py: e.clientY, w: win.w, h: win.h, x: win.x, y: win.y };
    let next = { w: win.w, h: win.h, x: win.x, y: win.y };
    let frame = 0;
    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - start.px;
      const dy = ev.clientY - start.py;
      let nw = start.w;
      let nh = start.h;
      let nx = start.x;
      let ny = start.y;

      if (dir.includes("e")) {
        nw = Math.max(min.w, Math.min(start.w + dx, vp.w - start.x));
      }
      if (dir.includes("w")) {
        const proposedW = start.w - dx;
        nw = Math.max(min.w, Math.min(proposedW, start.x + start.w));
        nx = start.x + (start.w - nw);
      }
      if (dir.includes("s")) {
        nh = Math.max(min.h, Math.min(start.h + dy, deskHeight(vp) - start.y));
      }
      if (dir.includes("n")) {
        const proposedH = start.h - dy;
        nh = Math.max(min.h, Math.min(proposedH, start.y + start.h));
        ny = start.y + (start.h - nh);
      }

      next = { w: nw, h: nh, x: nx, y: ny };
      if (!frame) {
        frame = requestAnimationFrame(() => {
          frame = 0;
          el.style.width = `${next.w}px`;
          el.style.height = `${next.h}px`;
          el.style.left = `${next.x}px`;
          el.style.top = `${next.y}px`;
        });
      }
    };
    const onUp = () => {
      cancelAnimationFrame(frame);
      handle.removeEventListener("pointermove", onMove);
      handle.removeEventListener("pointerup", onUp);
      handle.removeEventListener("pointercancel", onUp);
      el.style.width = `${next.w}px`;
      el.style.height = `${next.h}px`;
      el.style.left = `${next.x}px`;
      el.style.top = `${next.y}px`;
      windowStore.getState().setBounds(id, next.x, next.y, next.w, next.h);
    };
    handle.addEventListener("pointermove", onMove);
    handle.addEventListener("pointerup", onUp);
    handle.addEventListener("pointercancel", onUp);
  };

  const menus: Record<MenuName, MenuItem[]> = {
    Dosya: [{ label: "Kapat", onSelect: () => void requestClose() }],
    Görünüm: [{ label: "Yenile", onSelect: () => setReloadKey((k) => k + 1) }],
    Yardım: [
      {
        label: "Hakkında",
        onSelect: () =>
          void alertDialog({
            title: `Hakkında — ${app.title}`,
            message: `${app.title}\nF&B Command Center uygulaması (${app.id})`,
          }),
      },
    ],
  };

  const openMenu = (name: MenuName, button: HTMLElement) => {
    if (menu?.name === name) {
      setMenu(null);
      return;
    }
    const r = button.getBoundingClientRect();
    menuAnchor.current = button;
    setMenu({ name, x: r.left, y: r.bottom });
  };

  let body: ReactNode;
  if (app.needsHotel && !win.hotelId) {
    body = <HotelPicker hotels={pickable} onPick={(hotelId) => actions.setHotel(id, hotelId)} />;
  } else if (app.kind === "component") {
    body = (
      <AppErrorBoundary key={reloadKey}>
        <Suspense fallback={<div className="xp-app-loading">Yükleniyor…</div>}>
          <AppHost app={app} props={{ ...appProps, hotelId: win.hotelId, initialPanel: win.initialPanel, initialOutletId: win.initialOutletId }} />
        </Suspense>
      </AppErrorBoundary>
    );
  } else if (isSameOriginPath(app.url)) {
    body = (
      <iframe
        key={reloadKey}
        src={appFrameUrl(app.url, { fontFamily, theme })}
        title={app.title}
        sandbox="allow-same-origin allow-scripts allow-forms"
        className="xp-iframe"
      />
    );
  } else {
    body = <div className="xp-app-error">Bu uygulamanın adresi geçersiz.</div>;
  }

  const className = [
    "xp-window",
    active ? "is-active" : "is-inactive",
    win.maximized ? "is-maximized" : "",
  ].join(" ");

  return (
    <section
      ref={ref}
      aria-label={win.title}
      className={className}
      hidden={win.minimized}
      style={{ left: win.x, top: win.y, width: win.w, height: win.h, zIndex: win.z }}
      onPointerDownCapture={() => actions.focus(id)}
      onFocusCapture={() => actions.focus(id)}
    >
      <div
        className="xp-titlebar"
        data-testid="window-titlebar"
        onPointerDown={startDrag}
        onDoubleClick={(e) => {
          if (resizable && !(e.target as Element).closest("button")) actions.toggleMaximize(id);
        }}
      >
        <XpIcon name={app.icon} size={16} />
        <span className="xp-titlebar-text">{win.title}</span>
        <button
          type="button"
          className="xp-title-button"
          aria-label="Simge durumuna küçült"
          onClick={() => actions.minimize(id)}
        >
          _
        </button>
        {resizable ? (
          <button
            type="button"
            className="xp-title-button"
            aria-label={win.maximized ? "Önceki boyut" : "Ekranı kapla"}
            onClick={() => actions.toggleMaximize(id)}
          >
            {win.maximized ? "❐" : "□"}
          </button>
        ) : null}
        <button
          type="button"
          className="xp-title-button is-close"
          aria-label="Kapat"
          onClick={() => void requestClose()}
        >
          ×
        </button>
      </div>
      <div className="xp-menubar" role="menubar" aria-label={`${app.title} menüsü`}>
        {MENU_NAMES.map((name) => (
          <button
            key={name}
            type="button"
            role="menuitem"
            aria-haspopup="menu"
            aria-expanded={menu?.name === name}
            className="xp-menubar-item"
            onClick={(e) => openMenu(name, e.currentTarget)}
          >
            {name}
          </button>
        ))}
      </div>
      <div className="xp-window-body">{body}</div>
      <div className="xp-statusbar">
        Otel: {hotel?.name ?? "—"} · Kullanıcı: {userName} · {status}
      </div>
      {resizable && !win.maximized ? (
        <>
          <div className="xp-resize-handle is-e" data-testid="resize-handle-e" aria-hidden="true" onPointerDown={(e) => startResize(e, "e")} />
          <div className="xp-resize-handle is-w" data-testid="resize-handle-w" aria-hidden="true" onPointerDown={(e) => startResize(e, "w")} />
          <div className="xp-resize-handle is-s" data-testid="resize-handle-s" aria-hidden="true" onPointerDown={(e) => startResize(e, "s")} />
          <div className="xp-resize-handle is-n" data-testid="resize-handle-n" aria-hidden="true" onPointerDown={(e) => startResize(e, "n")} />
          <div className="xp-resize-handle is-se" aria-hidden="true" onPointerDown={(e) => startResize(e, "se")} />
          <div className="xp-resize-handle is-sw" aria-hidden="true" onPointerDown={(e) => startResize(e, "sw")} />
          <div className="xp-resize-handle is-ne" aria-hidden="true" onPointerDown={(e) => startResize(e, "ne")} />
          <div className="xp-resize-handle is-nw" aria-hidden="true" onPointerDown={(e) => startResize(e, "nw")} />
          <div className="xp-resize-grip" aria-hidden="true" onPointerDown={(e) => startResize(e, "se")} />
        </>
      ) : null}
      {menu ? (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          label={menu.name}
          items={menus[menu.name]}
          anchorRef={menuAnchor}
          onClose={() => setMenu(null)}
        />
      ) : null}
    </section>
  );
}

/** Keeps a crashing app inside its window instead of taking the whole desktop down. */
class AppErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (this.state.failed) {
      return (
        <div className="xp-app-error" role="alert">
          Uygulama beklenmeyen bir hatayla durdu. Görünüm → Yenile ile yeniden başlatın.
        </div>
      );
    }
    return this.props.children;
  }
}
