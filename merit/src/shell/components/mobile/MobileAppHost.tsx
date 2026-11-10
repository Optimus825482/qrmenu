"use client";

import {
  createElement,
  lazy,
  Suspense,
  useMemo,
  useState,
  type ComponentType,
  type LazyExoticComponent,
} from "react";
import { appFrameUrl } from "../../appearance";
import type { AppDefinition, AppProps } from "../../registry";
import { hotelsForApp, useWindowStore, windowStore } from "../../windowStore";
import { HotelPicker } from "../HotelPicker";
import { AppErrorBoundary } from "../Window";

/** What the opener asked for (a folder icon passes the hotel, a shortcut a sub-panel). */
export type MobileLaunch = { hotelId?: string; panel?: string; outletId?: string };

type Props = {
  app: AppDefinition;
  launch: MobileLaunch;
  /** Opens another app on the phone (folders and cross-links inside an app). */
  onOpenApp(appId: string, opts?: MobileLaunch): void;
  onClose(): void;
};

const lazyApps = new Map<string, LazyExoticComponent<ComponentType<AppProps>>>();

function lazyApp(app: AppDefinition): LazyExoticComponent<ComponentType<AppProps>> | undefined {
  if (!app.component) return undefined;
  let comp = lazyApps.get(app.id);
  if (!comp) {
    comp = lazy(app.component);
    lazyApps.set(app.id, comp);
  }
  return comp;
}

/** Module-level, so the lazy component keeps its identity between renders. */
function AppBody({ app, props }: { app: AppDefinition; props: AppProps }) {
  const comp = lazyApp(app);
  if (!comp) return <div className="xp-app-error">Bu uygulamanın bileşeni yok.</div>;
  return createElement(comp, props);
}

const isSameOriginPath = (url: string | undefined): url is string =>
  typeof url === "string" && url.startsWith("/") && !url.startsWith("//") && !url.includes("\\");

const noop = () => {};

/**
 * A registered desktop app (the same component an XP window shows) running full screen on the
 * phone: the hotel picker first when the app needs a hotel, then the app. The screen is the
 * desktop layout, so it scrolls in both directions where it does not fit.
 */
export function MobileAppHost({ app, launch, onOpenApp, onClose }: Props) {
  // A string, not the array: a selector must return a stable value between renders.
  const pickableIds = useWindowStore((s) =>
    hotelsForApp(s, app.id)
      .map((h) => h.id)
      .join("|"),
  );
  const pickable = useMemo(
    () =>
      windowStore
        .getState()
        .hotels.filter((h) => pickableIds.split("|").includes(h.id))
        .map((h) => ({ id: h.id, name: h.name, code: h.code ?? "" })),
    [pickableIds],
  );
  const fontFamily = useWindowStore((s) => s.fontFamily);
  const theme = useWindowStore((s) => s.theme);
  // undefined = no choice yet (take the opener's hotel); "" = the user asked for the picker again.
  const [picked, setPicked] = useState<string | undefined>(undefined);

  const asked = launch.hotelId && pickable.some((h) => h.id === launch.hotelId) ? launch.hotelId : undefined;
  const only = app.needsHotel && pickable.length === 1 ? pickable[0].id : undefined;
  const hotelId = picked === "" ? only : (picked ?? asked ?? only);

  const shared = useMemo<Omit<AppProps, "hotelId" | "initialPanel" | "initialOutletId">>(
    () => ({
      windowId: `mb-${app.id}`,
      close: onClose,
      setStatus: noop,
      setDirty: noop,
      setTitle: noop,
      openApp: onOpenApp,
    }),
    [app.id, onClose, onOpenApp],
  );

  let body;
  if (app.needsHotel && !hotelId) {
    body = <HotelPicker hotels={pickable} onPick={setPicked} />;
  } else if (app.kind === "component") {
    body = (
      <AppErrorBoundary key={hotelId ?? "all"}>
        <Suspense fallback={<div className="xp-app-loading">Yükleniyor…</div>}>
          <AppBody
            app={app}
            props={{ ...shared, hotelId, initialPanel: launch.panel, initialOutletId: launch.outletId }}
          />
        </Suspense>
      </AppErrorBoundary>
    );
  } else if (isSameOriginPath(app.url)) {
    const target = hotelId
      ? `${app.url}${app.url.includes("?") ? "&" : "?"}hotelId=${encodeURIComponent(hotelId)}`
      : app.url;
    body = (
      <iframe
        key={hotelId ?? ""}
        src={appFrameUrl(target, { fontFamily, theme })}
        title={app.launchLabel ?? app.title}
        sandbox="allow-same-origin allow-scripts allow-forms allow-modals"
        className="xp-iframe"
      />
    );
  } else {
    body = <div className="xp-app-error">Bu uygulamanın adresi geçersiz.</div>;
  }

  return (
    <div className="mb-xp-host">
      {app.needsHotel && hotelId && pickable.length > 1 ? (
        <div className="mb-xp-hotel">
          <span>{pickable.find((h) => h.id === hotelId)?.name}</span>
          <button type="button" className="mb-text-button" onClick={() => setPicked("")}>
            Otel değiştir
          </button>
        </div>
      ) : null}
      <div className="mb-xp-body">{body}</div>
    </div>
  );
}
