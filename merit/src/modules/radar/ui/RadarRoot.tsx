"use client";

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useStore } from "zustand";
import { Icon } from "@/components/icons/Icon";
import { DensityRoot } from "@/components/ui/Density";
import { EmptyState } from "@/components/ui/EmptyState";
import { sseClient } from "@/shell/sseStore";
import { LAYER_LABELS, metricLayer } from "../labels";
import type { RadarAlert, RadarEvent, RadarLayer, WallView } from "../types";
import { AlertStrip } from "./AlertStrip";
import { Legend, consumeInitialLegendOpen } from "./Legend";
import { MenuBar, type MenuDef } from "./MenuBar";
import { MotionLayer } from "./motion/MotionLayer";
import { useMotionPreference } from "./motion/useMotionPreference";
import { ReplayPlayer } from "./ReplayPlayer";
import { Ticker } from "./Ticker";
import { Timeline } from "./Timeline";
import { CONNECTION_TEXT, Toolbar, VIEW_LABELS, type ConnectionState, type ViewKey } from "./Toolbar";
import { WallShell } from "./WallShell";
import type { PlaybackSpeed } from "./playback";
import { RadarStoreContext, useNow, useRadar } from "./useRadar";
import { Floor } from "./views/Floor";
import { Overview } from "./views/Overview";
import { Queues } from "./views/Queues";
import { RoomService } from "./views/RoomService";
import { Staff } from "./views/Staff";
import { Tables } from "./views/Tables";
import { createSoundGate, createWallController } from "./wall";
import "./radar.css";

export type RadarInitial = {
  hotels: { id: string; code: string; name: string; canReplay?: boolean }[];
  hotelId: string | "ALL";
  views?: WallView[];
  rotateSeconds?: number;
  outletId?: string;
  soundOnEscalation?: boolean;
};

export type RadarRootProps = {
  mode: "window" | "wall";
  initial: RadarInitial;
  openApp?: (id: string) => void;
  /** Window chrome supplied by the XP shell. */
  chrome?: { setTitle?(title: string): void; setStatus?(text: string): void };
};

const VIEW_SLOTS: ViewKey[] = ["genel", "kat", "masa", "kuyruk", "odaServisi", "personel"];
const LAYER_ORDER: RadarLayer[] = ["MINIBAR", "SIPARIS", "ODA_SERVISI", "PERSONEL", "SISTEM"];
const SKELETON_DELAY_MS = 300;

const clock = (ms: number) =>
  new Intl.DateTimeFormat("tr-TR", {
    timeZone: "Europe/Nicosia",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date(ms));

function useDelayed(on: boolean, ms: number): boolean {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!on) return;
    const id = setTimeout(() => setShown(true), ms);
    return () => {
      clearTimeout(id);
      setShown(false);
    };
  }, [on, ms]);
  return on && shown;
}

const SHORTCUTS: [string, string][] = [
  ["1…6", "Genel Bakış · Kat · Masa · Kuyruklar · Oda Servisi · Personel"],
  ["Alt + 1…5", "Katmanı aç veya kapat"],
  ["Sol / Sağ ok", "10 saniye geri veya ileri sar (Shift ile 1 dk)"],
  ["End", "Canlıya dön / tekrarda sona atla"],
  ["Space · + / -", "Tekrarda oynat/duraklat ve hız değiştir"],
  ["Ctrl + Alt + F", "Duvar ekranı modunu aç"],
  ["F5", "Anlık görüntüyü yenile"],
  ["F1", "Bu yardımı aç veya kapat"],
  ["Ok tuşları · Enter · Esc", "Kat ızgarasında gezin, ayrıntı aç, kapat"],
];

export function RadarRoot({ mode, initial, openApp, chrome }: RadarRootProps) {
  const wall = mode === "wall";
  const idPrefix = useId();
  const [hotelId, setHotelId] = useState<string>(initial.hotelId);
  const [choice, setChoice] = useState<ViewKey | null>(null);
  const [off, setOff] = useState<ReadonlySet<RadarLayer>>(new Set());
  const [outletId, setOutletId] = useState<string | undefined>(initial.outletId);
  const [help, setHelp] = useState(false);
  const [replayDialog, setReplayDialog] = useState(false);
  const [legendOpen, setLegendOpen] = useState<boolean>(() => consumeInitialLegendOpen());
  const [soundEnabled, setSoundEnabled] = useState<boolean>(Boolean(initial.soundOnEscalation));
  const [cursorHidden, setCursorHidden] = useState<boolean>(false);
  const [wakeLockAvailable, setWakeLockAvailable] = useState<boolean>(true);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const helpClose = useRef<HTMLButtonElement | null>(null);
  const seenCritKeysRef = useRef<Set<string>>(new Set());
  const soundGateRef = useRef(createSoundGate({ minGapMs: 30_000, enabled: Boolean(initial.soundOnEscalation) }));

  const { store, state } = useRadar(hotelId);
  const motionPref = useMotionPreference();
  const sse = useStore(sseClient().store, (s) => s.status);
  const now = useNow(1000);
  const all = hotelId === "ALL";
  // A scope switch renders before the effect restarts the store; hide the old scope immediately.
  const scoped = state.hotelId === hotelId;
  const snap = scoped ? state.view : null;
  const overview = scoped ? state.overview : null;
  const overviewError = scoped ? state.overviewError : null;

  // Layers in scope: from the snapshot of one hotel, or from the counters that came with the overview.
  const scope = useMemo<RadarLayer[]>(() => {
    if (all) {
      const found = new Set<RadarLayer>();
      for (const h of overview?.hotels ?? []) for (const m of h.metrics) found.add(metricLayer(m.screenCode));
      return LAYER_ORDER.filter((l) => found.has(l));
    }
    if (!snap) return [];
    const l = snap.layers;
    return LAYER_ORDER.filter(
      (layer) =>
        layer === "SISTEM" ||
        (layer === "MINIBAR" && l.minibar) ||
        (layer === "SIPARIS" && l.order) ||
        (layer === "ODA_SERVISI" && l.roomService) ||
        (layer === "PERSONEL" && l.staff),
    );
  }, [all, snap, overview]);
  const active = useMemo(() => new Set(scope.filter((l) => !off.has(l))), [scope, off]);

  const views = useMemo<ViewKey[]>(() => {
    const out: ViewKey[] = ["genel"];
    if (all || !snap) return out;
    if (snap.layers.minibar && active.has("MINIBAR")) out.push("kat");
    if (snap.layers.order && active.has("SIPARIS")) out.push("masa");
    // Kuyruklar is SIPARIS + SISTEM; available in single-hotel view whenever either is active (displays empty state if QR_ORDER is off).
    if ((snap.layers.order && active.has("SIPARIS")) || active.has("SISTEM")) out.push("kuyruk");
    if (snap.layers.roomService && active.has("ODA_SERVISI")) out.push("odaServisi");
    if (snap.layers.staff && active.has("PERSONEL")) out.push("personel");
    return out;
  }, [all, snap, active]);

  const fallback: ViewKey = all
    ? "genel"
    : snap?.layers.minibar
      ? "kat"
      : snap?.layers.order
        ? "masa"
        : snap?.layers.roomService
          ? "odaServisi"
          : snap?.layers.staff
            ? "personel"
            : "genel";

  const wallRotateViews = useMemo<WallView[]>(() => {
    const raw = initial.views ?? snap?.config.wallViews ?? ["genel", "kat", "masa", "kuyruk"];
    const filtered = raw.filter((v) => views.includes(v));
    return filtered.length > 0 ? filtered : [views[0] ?? "genel"];
  }, [initial.views, snap?.config.wallViews, views]);

  const wallRotateSec = initial.rotateSeconds ?? snap?.config.wallRotateSeconds ?? 20;
  const wallCtrl = useMemo(
    () => createWallController({ views: wallRotateViews, rotateSeconds: wallRotateSec }),
    [wallRotateViews, wallRotateSec],
  );
  const wallState = wall ? wallCtrl.state(now) : null;

  const view: ViewKey =
    wall && wallState && (wallState.paused === "critical" || !choice)
      ? views.includes(wallState.view)
        ? wallState.view
        : fallback
      : choice && views.includes(choice)
        ? choice
        : views.includes(fallback)
          ? fallback
          : "genel";

  const activeOutletId =
    wall && wallState?.paused === "critical" && wallState.focus?.outletId
      ? wallState.focus.outletId
      : outletId;

  useEffect(() => {
    soundGateRef.current.setEnabled(soundEnabled);
  }, [soundEnabled]);

  useEffect(() => {
    if (!wall) return;
    for (const alert of state.alerts) {
      if (alert.severity !== "crit") continue;
      if (seenCritKeysRef.current.has(alert.key)) continue;
      seenCritKeysRef.current.add(alert.key);
      wallCtrl.critical(alert, Date.now());
      if (soundGateRef.current.shouldPlay(Date.now()) && typeof Audio !== "undefined") {
        try {
          const audio = new Audio("/sounds/error.wav");
          void audio.play().catch(() => undefined);
        } catch {
          // ignore audio errors
        }
      }
    }
  }, [wall, state.alerts, wallCtrl]);

  useEffect(() => {
    if (!wall) return;
    let id: ReturnType<typeof setTimeout> | undefined = setTimeout(() => setCursorHidden(true), 5_000);
    const onMove = () => {
      setCursorHidden(false);
      wallCtrl.interaction(Date.now());
      if (id) clearTimeout(id);
      id = setTimeout(() => setCursorHidden(true), 5_000);
    };
    window.addEventListener("mousemove", onMove, { passive: true });
    window.addEventListener("keydown", onMove, { passive: true });
    return () => {
      if (id) clearTimeout(id);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("keydown", onMove);
    };
  }, [wall, wallCtrl]);

  const connection: ConnectionState =
    state.connection === "offline" || sse === "closed"
      ? "offline"
      : state.connection === "connecting" || sse === "connecting"
        ? "connecting"
        : "live";

  const hotelName = all ? "Tüm kompleks" : (initial.hotels.find((h) => h.id === hotelId)?.name ?? "");
  useEffect(() => {
    chrome?.setTitle?.(`Canlı Radar · ${hotelName}`);
  }, [chrome, hotelName]);

  const lastEvent = scoped && state.lastEventAt ? Date.parse(state.lastEventAt) : undefined;
  const minutes = snap?.config.liveBufferMinutes ?? 30;
  useEffect(() => {
    chrome?.setStatus?.(
      `Otel: ${hotelName} · Son olay ${lastEvent ? clock(lastEvent) : "yok"} · Arabellek ${minutes} dk / ${state.buffer.length} olay`,
    );
  }, [chrome, hotelName, lastEvent, minutes, state.buffer.length]);

  useEffect(() => {
    if (help) helpClose.current?.focus();
  }, [help]);

  const loaded = all ? overview !== null : snap !== null;
  const failed = scoped && !loaded && state.connection === "offline";
  const skeleton = useDelayed((!loaded || (view === "genel" && !overview && !overviewError)) && !failed, SKELETON_DELAY_MS);

  const pickHotel = (id: string, next: ViewKey | null) => {
    setHotelId(id);
    setChoice(next);
    setOutletId(undefined);
  };
  const toggleLayer = (layer: RadarLayer) =>
    setOff((prev) => {
      const next = new Set(prev);
      if (next.has(layer)) next.delete(layer);
      else next.add(layer);
      return next;
    });

  const focusAlert = (alert: RadarAlert) => {
    if (alert.kind === "SIPARIS_ONAY" || alert.kind === "CAGRI") {
      if (alert.ref.outletId) setOutletId(alert.ref.outletId);
      if (views.includes("masa")) setChoice("masa");
    } else if (alert.kind === "YAZICI_IS" || alert.kind === "YAZICI") {
      if (views.includes("kuyruk")) setChoice("kuyruk");
    } else if (alert.kind === "RS_SLA") {
      if (views.includes("odaServisi")) setChoice("odaServisi");
    } else if (
      alert.kind === "MYBAR" ||
      alert.kind === "DND_EKSIK" ||
      alert.kind === "STOK" ||
      alert.kind === "YUKLEME"
    ) {
      if (views.includes("kat")) setChoice("kat");
    }
  };

  const focusEvent = (ev: RadarEvent) => {
    if (ev.layer === "MINIBAR" && views.includes("kat")) setChoice("kat");
    else if (ev.layer === "SIPARIS") {
      if (ev.outletId) setOutletId(ev.outletId);
      if (ev.type === "print.job" && views.includes("kuyruk")) setChoice("kuyruk");
      else if (views.includes("masa")) setChoice("masa");
    } else if (ev.layer === "ODA_SERVISI" && views.includes("odaServisi")) setChoice("odaServisi");
    else if (ev.layer === "PERSONEL" && views.includes("personel")) setChoice("personel");
    else if (ev.layer === "SISTEM" && views.includes("kuyruk")) setChoice("kuyruk");
  };

  const visibleEvents = useMemo(
    () => (scoped ? state.buffer.filter((e) => active.has(e.layer)) : []),
    [scoped, state.buffer, active],
  );
  const visibleAlerts = useMemo(() => (scoped ? state.alerts : []), [scoped, state.alerts]);
  // The animated scene follows the live stream and the day replay (at the replay speed); a scrubbed past is still.
  const motionSpeed = state.mode === "replay" && state.replay ? state.replay.speed : 1;
  const motionOn = motionPref.on && !all && state.mode !== "scrub";

  const currentHotel = useMemo(
    () => initial.hotels.find((h) => h.id === hotelId) ?? initial.hotels[0],
    [initial.hotels, hotelId],
  );
  const canReplay = currentHotel?.canReplay !== false;

  const openWallTab = () => {
    const code = currentHotel?.code ?? initial.hotels[0]?.code ?? "";
    const url = code ? `/radar?duvar=1&otel=${encodeURIComponent(code)}` : "/radar?duvar=1";
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const menus: MenuDef[] = [
    {
      label: "Dosya",
      items: [
        { kind: "action", label: "Anlık görüntüyü yenile", shortcut: "F5", onSelect: () => void store.getState().refresh() },
        { kind: "action", label: "Duvar ekranı modu", shortcut: "Ctrl+Alt+F", onSelect: openWallTab },
      ],
    },
    {
      label: "Görünüm",
      items: [
        ...views.map((v) => ({
          kind: "radio" as const,
          label: VIEW_LABELS[v],
          shortcut: String(VIEW_SLOTS.indexOf(v) + 1),
          checked: v === view,
          onSelect: () => setChoice(v),
        })),
        ...scope.map((l, i) => ({
          kind: "check" as const,
          label: `${LAYER_LABELS[l]} katmanı`,
          shortcut: `Alt+${i + 1}`,
          checked: active.has(l),
          onSelect: () => toggleLayer(l),
        })),
        {
          kind: "check" as const,
          label: "Açıklama göster",
          checked: legendOpen,
          onSelect: () => setLegendOpen((x) => !x),
        },
      ],
    },
    {
      label: "Oynat",
      items: [
        {
          kind: "action" as const,
          label: "Canlıya dön",
          shortcut: "End",
          onSelect: () => store.getState().goLive(),
        },
        ...(canReplay && !all
          ? [
              {
                kind: "action" as const,
                label: "Gün tekrarı…",
                onSelect: () => setReplayDialog(true),
              },
            ]
          : []),
      ],
    },
    {
      label: "Yardım",
      items: [{ kind: "action", label: "Klavye kısayolları", shortcut: "F1", onSelect: () => setHelp(true) }],
    },
  ];

  const cycleSpeed = (dir: 1 | -1) => {
    const s = store.getState();
    if (s.mode !== "replay" || !s.replay) return;
    const order: PlaybackSpeed[] = [1, 10, 60];
    const idx = order.indexOf(s.replay.speed);
    const next = order[Math.max(0, Math.min(order.length - 1, idx + dir))];
    s.replaySetSpeed(next);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (target.closest("select, input, textarea")) return;
    const s = store.getState();
    if (e.key === "F5") {
      e.preventDefault();
      void s.refresh();
    } else if (e.ctrlKey && e.altKey && (e.key === "f" || e.key === "F")) {
      e.preventDefault();
      if (!wall) openWallTab();
    } else if (e.key === "F1") {
      e.preventDefault();
      setHelp((h) => !h);
    } else if (e.key === "Escape") {
      if (help) {
        e.preventDefault();
        setHelp(false);
      } else if (replayDialog) {
        e.preventDefault();
        setReplayDialog(false);
      } else if (s.mode === "replay") {
        e.preventDefault();
        s.exitReplay();
      }
    } else if (e.key === "End") {
      if (!all) {
        e.preventDefault();
        if (s.mode === "replay") s.replayJumpToEnd();
        else s.goLive();
      }
    } else if (e.key === " " && s.mode === "replay") {
      e.preventDefault();
      s.replayToggle();
    } else if ((e.key === "+" || e.key === "=") && s.mode === "replay") {
      e.preventDefault();
      cycleSpeed(1);
    } else if (e.key === "-" && s.mode === "replay") {
      e.preventDefault();
      cycleSpeed(-1);
    } else if ((e.key === "ArrowLeft" || e.key === "ArrowRight") && !all && !target.closest("[role='grid']")) {
      e.preventDefault();
      const step = (e.shiftKey ? 60_000 : 10_000) * (e.key === "ArrowLeft" ? -1 : 1);
      if (s.mode === "replay" && s.replay) {
        s.replaySeek(s.replay.virtualMs + step);
      } else {
        const cur = s.cursor ?? now;
        const next = cur + step;
        if (next >= now) s.goLive();
        else s.scrubTo(next);
      }
    } else if (e.altKey && !e.ctrlKey && !e.metaKey && /^[1-5]$/.test(e.key)) {
      const layer = scope[Number(e.key) - 1];
      if (layer) {
        e.preventDefault();
        toggleLayer(layer);
      }
    } else if (!e.altKey && !e.ctrlKey && !e.metaKey && /^[1-6]$/.test(e.key)) {
      const next = VIEW_SLOTS[Number(e.key) - 1];
      if (next && views.includes(next)) {
        e.preventDefault();
        setChoice(next);
      }
    }
  };

  let body;
  if (failed) {
    body = (
      <div className="rd-center">
        <div role="alert">
          <EmptyState
            title="Radar verisi alınamadı"
            hint="Bağlantıyı veya yetkinizi kontrol edin."
            icon={<Icon name="wifi-off" size={32} />}
          />
          <p className="rd-center">
            <button type="button" className="rd-chip" onClick={() => void store.getState().refresh()}>
              Tekrar dene
            </button>
          </p>
        </div>
      </div>
    );
  } else if (!loaded) {
    body = skeleton ? (
      <div className="rd-skeleton" aria-busy="true" role="status" aria-label="Yükleniyor">
        <div className="rd-skeleton-row" />
        <div className="rd-skeleton-row" />
        <div className="rd-skeleton-row" />
      </div>
    ) : null;
  } else if (view === "genel") {
    if (overview) {
      body = (
        <Overview
          overview={overview}
          layers={active}
          views={all ? undefined : views}
          onOpenHotel={(id) => pickHotel(id, null)}
          onOpenView={(id, v) => (id === hotelId ? setChoice(v) : pickHotel(id, v))}
        />
      );
    } else if (overviewError) {
      body = (
        <div className="rd-center" role="alert">
          <EmptyState title="Genel bakış yüklenemedi" hint={overviewError} />
          <button type="button" className="rd-chip" onClick={() => void store.getState().refresh()}>
            Tekrar dene
          </button>
        </div>
      );
    } else {
      body = skeleton ? <div className="rd-center" aria-busy="true">Genel bakış yükleniyor</div> : null;
    }
  } else if (view === "kat" && snap) {
    body = <Floor view={snap} now={now} onOpenApp={openApp} />;
  } else if (view === "masa" && snap) {
    body = <Tables view={snap} now={now} outletId={activeOutletId} onSelectOutlet={setOutletId} onOpenApp={openApp} />;
  } else if (view === "kuyruk" && snap) {
    body = (
      <Queues
        view={snap}
        now={now}
        onOpenOutlet={(id) => {
          setOutletId(id);
          if (views.includes("masa")) setChoice("masa");
        }}
      />
    );
  } else if (view === "odaServisi" && snap) {
    body = <RoomService view={snap} now={now} onOpenApp={openApp} />;
  } else if (view === "personel" && snap) {
    body = <Staff view={snap} now={now} nameStyle={wall ? "short" : "full"} />;
  }

  return (
    <RadarStoreContext.Provider value={store}>
      <DensityRoot density={wall ? "pos" : "xp"}>
        <div
          ref={rootRef}
          className={`rd-root${wall && cursorHidden ? " rd-cursor-hidden" : ""}`}
          data-radar-density={wall ? "wall" : "xp"}
          // Focusable by script and click so Esc / End still reach the shortcuts after a focused button went away.
          tabIndex={-1}
          onKeyDown={onKeyDown}
        >
          {wall ? (
            <WallShell
              hotelName={hotelName}
              clockText={clock(now)}
              connection={connection}
              rotationLabel={wallState?.label ?? ""}
              soundEnabled={soundEnabled}
              onToggleSound={() => setSoundEnabled((x) => !x)}
              onWakeLockStatus={setWakeLockAvailable}
              wakeLockAvailable={wakeLockAvailable}
            />
          ) : (
            <MenuBar menus={menus} />
          )}
          <Toolbar
            idPrefix={idPrefix}
            hotels={initial.hotels}
            hotelId={hotelId}
            onHotel={(id) => pickHotel(id, null)}
            layers={scope}
            active={active}
            onToggleLayer={toggleLayer}
            views={views}
            view={view}
            onView={setChoice}
            connection={connection}
            motion={{ on: motionPref.on, reduced: motionPref.reduced, onToggle: motionPref.toggle }}
            modeText={
              state.mode === "replay" && state.replay
                ? `Tekrar ${clock(state.replay.virtualMs)}`
                : state.mode === "scrub" && state.cursor
                  ? `Geçmiş ${clock(state.cursor)}`
                  : CONNECTION_TEXT[connection]
            }
          />
          {!all && state.mode === "scrub" && state.cursor ? (
            <div className="rd-banner" data-tone="warn" role="status">
              <Icon name="rewind" size={14} />
              <span>
                Geçmiş görünüm · {clock(state.cursor)}
                {state.pending > 0 ? ` · +${state.pending} yeni olay` : ""}
              </span>
              <button type="button" className="rd-chip" onClick={() => store.getState().goLive()}>
                Canlıya dön (End)
              </button>
            </div>
          ) : null}
          {!all && state.mode === "replay" && state.replay ? (
            <div className="rd-banner" data-tone="info" role="status">
              <Icon name="play" size={14} />
              <span>
                Tekrar · {state.replay.day} · {clock(state.replay.virtualMs)} · {state.replay.speed}×
              </span>
              <button type="button" className="rd-chip" onClick={() => store.getState().exitReplay()}>
                Canlıya dön (Esc)
              </button>
            </div>
          ) : null}
          {loaded && connection === "offline" && state.mode !== "replay" ? (
            <div className="rd-banner" data-tone="danger" role="status">
              <Icon name="wifi-off" size={14} />
              <span>
                Bağlantı yok. Son olay {lastEvent ? clock(lastEvent) : "yok"}. Gösterilen veri eski olabilir.
              </span>
              <button type="button" onClick={() => void store.getState().refresh()}>
                Tekrar dene
              </button>
            </div>
          ) : null}
          {!all ? <AlertStrip alerts={visibleAlerts} onFocus={focusAlert} /> : null}
          <div className="rd-workspace">
            <div
              id={`${idPrefix}-view`}
              className="rd-main"
              role="tabpanel"
              aria-labelledby={`${idPrefix}-tab-${view}`}
              tabIndex={0}
            >
              {body}
              <Legend view={view} open={wall || legendOpen} compact={wall} onClose={() => setLegendOpen(false)} />
            </div>
            {!all && !wall ? (
              <Ticker events={visibleEvents} state={snap} mode="window" nameStyle="full" onSelect={focusEvent} />
            ) : null}
          </div>
          {!all && wall ? (
            <Ticker events={visibleEvents} state={snap} mode="wall" nameStyle="short" onSelect={focusEvent} />
          ) : null}
          {!all && loaded ? (
            <Timeline
              mode={state.mode}
              nowMs={now}
              liveBufferMinutes={minutes}
              cursorMs={state.cursor}
              buffer={visibleEvents}
              gaps={state.gaps}
              replay={state.replay}
              onScrub={(ms) => store.getState().scrubTo(ms)}
              onGoLive={() => store.getState().goLive()}
              onReplayToggle={() => store.getState().replayToggle()}
              onReplaySpeed={(s) => store.getState().replaySetSpeed(s)}
              onReplayJumpToEnd={() => store.getState().replayJumpToEnd()}
              onExitReplay={() => store.getState().exitReplay()}
            />
          ) : null}
          <ReplayPlayer
            open={replayDialog}
            nowMs={now}
            retentionDays={snap?.config.replayRetentionDays ?? 90}
            hotelId={hotelId}
            onStart={({ hotelId: hid, day, from, to, speed }) =>
              store.getState().enterReplay({ hotelId: hid, day, from, to, speed })
            }
            onClose={() => setReplayDialog(false)}
          />
          <MotionLayer rootRef={rootRef} state={snap} events={visibleEvents} speed={motionSpeed} enabled={motionOn} />
          {help ? (
            <div className="rd-help" role="dialog" aria-label="Klavye kısayolları">
              <div className="rd-row">
                <h3>Klavye kısayolları</h3>
                <button ref={helpClose} type="button" className="rd-link" onClick={() => setHelp(false)}>
                  Kapat
                </button>
              </div>
              <dl className="rd-kbd">
                {SHORTCUTS.map(([k, d]) => (
                  <div key={k} style={{ display: "contents" }}>
                    <dt>{k}</dt>
                    <dd>{d}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ) : null}
        </div>
      </DensityRoot>
    </RadarStoreContext.Provider>
  );
}
