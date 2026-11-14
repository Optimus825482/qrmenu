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
import { PathBar, type PathLevel, type PathPlace } from "./PathBar";
import { VIEW_RECORD, alertRecord, eventRecord, floorOptions, floorRoomNumbers, pathSteps, type RadarRecord } from "./path";
import { MotionLayer } from "./motion/MotionLayer";
import { useMotionPreference } from "./motion/useMotionPreference";
import { useDemoMode } from "./demoPreference";
import { DEMO_FOCUS_SHORT, type DemoFocus } from "./demo/demoScenario";
import { useDemo } from "./demo/useDemo";
import { DemoDialog } from "./DemoDialog";
import { ReplayPlayer } from "./ReplayPlayer";
import { Ticker } from "./Ticker";
import { Timeline } from "./Timeline";
import { ALERT_LAYER } from "../alerts";
import { CONNECTION_TEXT, Toolbar, VIEW_LABELS, VIEW_SLOTS, type ConnectionState, type ViewKey } from "./Toolbar";
import { WallShell } from "./WallShell";
import type { PlaybackSpeed } from "./playback";
import { RadarStoreContext, useNow, useRadar } from "./useRadar";
import { Floor } from "./views/Floor";
import { Mybar } from "./views/Mybar";
import { Overview } from "./views/Overview";
import { Queues } from "./views/Queues";
import { RoomService } from "./views/RoomService";
import { Staff } from "./views/Staff";
import { Tables } from "./views/Tables";
import { createSoundGate, createWallController } from "./wall";
import { playRadarSound } from "./radarSound";
import "./radar.css";

export type RadarInitial = {
  hotels: { id: string; code: string; name: string; canReplay?: boolean }[];
  hotelId: string | "ALL";
  views?: WallView[];
  rotateSeconds?: number;
  outletId?: string;
  soundOnEscalation?: boolean;
  demoMode?: boolean;
};

export type RadarRootProps = {
  mode: "window" | "wall";
  initial: RadarInitial;
  openApp?: (id: string) => void;
  /** Window chrome supplied by the XP shell. */
  chrome?: { setTitle?(title: string): void; setStatus?(text: string): void };
};

const LAYER_ORDER: RadarLayer[] = ["MINIBAR", "SIPARIS", "ODA_SERVISI", "PERSONEL", "SISTEM"];
const SKELETON_DELAY_MS = 300;
/** The hotel, view and outlet a module demo replaced. */
type DemoPrev = { hotelId: string; choice: ViewKey | null; outletId?: string };
/** The view each demo module opens on. */
const DEMO_VIEW: Record<DemoFocus, ViewKey> = { MINIBAR: "kat", OUTLET: "masa", ROOM_SERVICE: "odaServisi" };

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

/** Cards a lane shows on the wall (longest wait first); the rest is a "+N" line, since a TV cannot scroll. */
const WALL_LANE_CARDS = 6;
/** Long lists on the wall (floors, sessions, outlets) turn a page this often. */
const WALL_PAGING = { periodMs: 8000 };

const SHORTCUTS: [string, string][] = [
  ["1…7", "Genel Bakış · Kat · Masa · Kuyruklar · Oda Servisi · Personel · MyBar"],
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
  // Drill-down below the operation: the place (a floor; the outlet is `outletId`) and the open record.
  const [floorId, setFloorId] = useState<string | undefined>(undefined);
  const [record, setRecord] = useState<RadarRecord | null>(null);
  const [help, setHelp] = useState(false);
  const [replayDialog, setReplayDialog] = useState(false);
  const [demoDialog, setDemoDialog] = useState(false);
  // Picked in the dialog, waiting for the chosen hotel's snapshot (the demo builds on its ids). `demoKick` only re-renders.
  const pendingDemo = useRef<{ hotelId: string; focus: DemoFocus; prev: DemoPrev } | null>(null);
  const [demoKick, setDemoKick] = useState(0);
  // The module demo that is running: what it replaced, to put back when it ends.
  const demoSession = useRef<DemoPrev | null>(null);
  const [legendOpen, setLegendOpen] = useState<boolean>(() => consumeInitialLegendOpen());
  const [soundEnabled, setSoundEnabled] = useState<boolean>(Boolean(initial.soundOnEscalation));
  const [cursorHidden, setCursorHidden] = useState<boolean>(false);
  const [wakeLockAvailable, setWakeLockAvailable] = useState<boolean>(true);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const helpClose = useRef<HTMLButtonElement | null>(null);
  const seenCritKeysRef = useRef<Set<string>>(new Set());
  const critSeededRef = useRef<string | null>(null);
  const soundGateRef = useRef(createSoundGate({ minGapMs: 30_000, enabled: Boolean(initial.soundOnEscalation) }));

  const { store, state } = useRadar(hotelId);
  const motionPref = useMotionPreference();
  const [storedDemoMode] = useDemoMode();
  const demoModeActive = initial.demoMode ?? storedDemoMode;
  const sse = useStore(sseClient().store, (s) => s.status);
  const now = useNow(1000);
  const all = hotelId === "ALL";
  const demo = useDemo(store, {
    hotelId,
    enabled: !all,
    onEnd: () => {
      // Stopped, finished or left: put the hotel and view back (a hotel picked by hand has dropped the session).
      const prev = demoSession.current;
      demoSession.current = null;
      if (!prev) return;
      setHotelId(prev.hotelId);
      setChoice(prev.choice);
      setOutletId(prev.outletId);
      setFloorId(undefined);
      setRecord(null);
    },
  });
  const demoStart = demo.start;
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
  // A layer that is switched off takes its alerts with it (strip, sound and the wall's critical hold).
  const visibleAlerts = useMemo(
    () => (scoped ? state.alerts.filter((a) => active.has(ALERT_LAYER[a.kind])) : []),
    [scoped, state.alerts, active],
  );

  const views = useMemo<ViewKey[]>(() => {
    const out: ViewKey[] = ["genel"];
    if (all || !snap) return out;
    if (snap.layers.minibar && active.has("MINIBAR")) out.push("kat");
    if (snap.layers.order && active.has("SIPARIS")) out.push("masa");
    // Kuyruklar is SIPARIS + SISTEM; available in single-hotel view whenever either is active (displays empty state if QR_ORDER is off).
    if ((snap.layers.order && active.has("SIPARIS")) || active.has("SISTEM")) out.push("kuyruk");
    if (snap.layers.roomService && active.has("ODA_SERVISI")) out.push("odaServisi");
    if (snap.layers.minibar && active.has("MINIBAR")) out.push("mybar");
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
  // Keyed by content: a new snapshot hands over an equal list in a new array, and rebuilding the controller
  // would drop the rotation position and an interaction/critical pause that is in progress.
  const wallRotateKey = wallRotateViews.join("|");
  const wallCtrl = useMemo(
    () => createWallController({ views: wallRotateKey.split("|") as WallView[], rotateSeconds: wallRotateSec }),
    [wallRotateKey, wallRotateSec],
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

  const wallIdle = wall && wallState?.paused !== "interaction";
  // Wall: a view picked by hand holds only while the interaction pause runs, then the rotation takes over again
  // (state adjusted during render, so the stale pick never paints).
  if (wallIdle && choice !== null) setChoice(null);
  // The same for a record opened by touch: it closes when the rotation resumes.
  if (wallIdle && record !== null) setRecord(null);

  const overviewShown = view === "genel";
  useEffect(() => {
    store.getState().watchOverview(overviewShown);
    return () => store.getState().watchOverview(true);
  }, [store, overviewShown]);

  const activeOutletId =
    wall && wallState?.paused === "critical" && wallState.focus?.outletId
      ? wallState.focus.outletId
      : outletId;

  const toggleSound = () => {
    setSoundEnabled((prev) => {
      const next = !prev;
      if (next) {
        playRadarSound("ready");
      }
      return next;
    });
  };

  const initializedEventsRef = useRef(false);
  const seenEventIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!initializedEventsRef.current) {
      for (const ev of state.buffer) seenEventIdsRef.current.add(ev.id);
      initializedEventsRef.current = true;
      return;
    }
    // Every event is marked as heard, sound on or off: switching the sound on must not replay the buffer.
    // A replay or the demo is silent: a jump would play a whole day at once.
    const audible = soundEnabled && state.mode === "live";
    if (seenEventIdsRef.current.size > 4 * state.buffer.length + 1000) {
      seenEventIdsRef.current = new Set(state.buffer.map((ev) => ev.id));
      return;
    }
    for (const ev of state.buffer) {
      if (seenEventIdsRef.current.has(ev.id)) continue;
      seenEventIdsRef.current.add(ev.id);
      if (!audible) continue;
      if (ev.type === "call.opened") {
        playRadarSound("call");
      } else if (ev.type === "order.status" && ev.to === "GONDERILDI") {
        playRadarSound("new-order");
      }
    }
  }, [soundEnabled, state.buffer, state.mode]);

  useEffect(() => {
    soundGateRef.current.setEnabled(soundEnabled);
  }, [soundEnabled]);

  useEffect(() => {
    // Only the live floor rings: a replay, the demo or a scope that is still loading stays quiet.
    if (!scoped || !state.view || state.mode !== "live") return;
    const seen = seenCritKeysRef.current;
    const first = critSeededRef.current !== state.hotelId;
    critSeededRef.current = state.hotelId;
    const current = new Set<string>();
    for (const alert of visibleAlerts) {
      // An alert that got worse (dikkat -> kritik) is a new thing to hear.
      const mark = `${alert.severity}|${alert.key}`;
      current.add(mark);
      if (seen.has(mark)) continue;
      seen.add(mark);
      // What was already there when the screen opened is shown, not announced.
      if (first || alert.severity !== "crit") continue;
      if (wall) wallCtrl.critical(alert, Date.now());
      if (soundEnabled && soundGateRef.current.shouldPlay(Date.now())) {
        if (alert.kind === "CAGRI") {
          playRadarSound("call");
        } else if (alert.kind === "SIPARIS_ONAY") {
          playRadarSound("new-order");
        } else {
          playRadarSound("error");
        }
      }
    }
    // A cleared alert is forgotten, so the same printer or room failing again is announced again.
    for (const mark of seen) if (!current.has(mark)) seen.delete(mark);
  }, [wall, soundEnabled, visibleAlerts, wallCtrl, scoped, state.view, state.mode, state.hotelId]);

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
    window.addEventListener("pointerdown", onMove, { passive: true });
    return () => {
      if (id) clearTimeout(id);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("keydown", onMove);
      window.removeEventListener("pointerdown", onMove);
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

  useEffect(() => {
    const pick = pendingDemo.current;
    if (!pick || hotelId !== pick.hotelId) return;
    if (failed) {
      pendingDemo.current = null;
    } else if (scoped && snap && state.mode === "live") {
      pendingDemo.current = null;
      demoSession.current = pick.prev;
      demoStart(pick.focus);
    }
  }, [hotelId, failed, scoped, snap, state.mode, demoKick, demoStart]);

  const pickHotel = (id: string, next: ViewKey | null) => {
    // Picking a hotel by hand ends the claim of a module demo on the view it will restore.
    pendingDemo.current = null;
    demoSession.current = null;
    setHotelId(id);
    setChoice(next);
    setOutletId(undefined);
    setFloorId(undefined);
    setRecord(null);
  };
  /** Another operation of the same hotel: the place filter stays (a floor is a floor in every room view), the record closes. */
  const goView = (next: ViewKey) => {
    setChoice(next);
    setRecord(null);
  };
  /** Opens `target` on the record it was asked for; a floor filter must not hide a record of another floor. */
  const openView = (target: ViewKey, rec: RadarRecord | null) => {
    if (!views.includes(target)) return;
    setChoice(target);
    setRecord(rec);
    if (rec) setFloorId(undefined);
  };
  // The overview has no moving scene: the switch goes to the first hotel and switches the scene on there.
  const toggleMotion = () => {
    if (!all) return motionPref.toggle();
    const first = initial.hotels[0];
    if (!first) return;
    if (!motionPref.on) motionPref.toggle();
    pickHotel(first.id, null);
  };
  const beginDemo = ({ focus, hotelId: target }: { focus: DemoFocus; hotelId: string }) => {
    setDemoDialog(false);
    const prev: DemoPrev = { hotelId, choice, outletId };
    if (store.getState().mode === "scrub") store.getState().goLive();
    pickHotel(target, DEMO_VIEW[focus]);
    pendingDemo.current = { hotelId: target, focus, prev };
    setDemoKick((n) => n + 1);
  };
  const toggleLayer = (layer: RadarLayer) =>
    setOff((prev) => {
      const next = new Set(prev);
      if (next.has(layer)) next.delete(layer);
      else next.add(layer);
      return next;
    });

  const focusAlert = (alert: RadarAlert) => {
    let target: ViewKey | undefined;
    if (alert.kind === "SIPARIS_ONAY" || alert.kind === "SIPARIS_TAKILI" || alert.kind === "CAGRI") {
      if (alert.ref.outletId) setOutletId(alert.ref.outletId);
      target = "masa";
    } else if (alert.kind === "YAZICI_IS" || alert.kind === "YAZICI") target = "kuyruk";
    else if (alert.kind === "RS_SLA") target = "odaServisi";
    else if (alert.kind === "MYBAR") target = views.includes("mybar") ? "mybar" : "kat";
    else if (alert.kind === "PERSONEL_BOSTA") target = "personel";
    else if (
      alert.kind === "DND_EKSIK" ||
      alert.kind === "STOK" ||
      alert.kind === "YUKLEME" ||
      alert.kind === "YUKLEME_HATA" ||
      alert.kind === "MINIBAR_ONAY"
    ) {
      target = "kat";
    }
    if (target) openView(target, alertRecord(alert, target));
  };

  const focusEvent = (ev: RadarEvent) => {
    let target: ViewKey | undefined;
    if (ev.type.startsWith("mybar.") && views.includes("mybar")) target = "mybar";
    else if (ev.layer === "MINIBAR") target = "kat";
    else if (ev.layer === "SIPARIS") {
      if (ev.outletId) setOutletId(ev.outletId);
      target = ev.type === "print.job" && views.includes("kuyruk") ? "kuyruk" : "masa";
    } else if (ev.layer === "ODA_SERVISI") target = "odaServisi";
    else if (ev.layer === "PERSONEL") target = "personel";
    else if (ev.layer === "SISTEM") target = "kuyruk";
    if (target) openView(target, eventRecord(ev, target));
  };

  const visibleEvents = useMemo(
    () => (scoped ? state.buffer.filter((e) => active.has(e.layer)) : []),
    [scoped, state.buffer, active],
  );
  // The animated scene follows the live stream and the day replay (at the replay speed); a scrubbed past is still.
  const motionSpeed = state.mode === "replay" && state.replay ? state.replay.speed : 1;
  // A module demo shows its moving scene whatever the toolbar switch says.
  const demoMotion = demo.running && demo.focus !== undefined;
  const animationOn = (motionPref.on || demoMotion) && !all;
  const motionOn = animationOn && state.mode !== "scrub";

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

  /**
   * Back to the app from a Radar tab. The tab was opened by the app (window.open), so it can close itself; on
   * a tablet or phone where the browser keeps it open (an installed app shows it without tabs or a back
   * button), it goes back in history, or to the start page when there is nothing behind it.
   */
  const exitToApp = () => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    window.close();
    window.setTimeout(() => {
      if (window.closed) return;
      if (window.history.length > 1) window.history.back();
      else window.location.assign("/baslat");
    }, 250);
  };

  const menus: MenuDef[] = [
    {
      label: "Dosya",
      items: [
        { kind: "action", label: "Anlık görüntüyü yenile", shortcut: "F5", onSelect: () => void store.getState().refresh() },
        { kind: "action", label: "Duvar ekranı modu", shortcut: "Ctrl+Alt+F", onSelect: openWallTab },
        { kind: "action", label: "Uygulamaya dön", onSelect: exitToApp },
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
          onSelect: () => goView(v),
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
    } else if (!e.altKey && !e.ctrlKey && !e.metaKey && /^[1-7]$/.test(e.key)) {
      const next = VIEW_SLOTS[Number(e.key) - 1];
      if (next && views.includes(next)) {
        e.preventDefault();
        goView(next);
      }
    }
  };

  // The cards age against the instant they show: the replay's clock or the scrub cursor, not the wall clock.
  const viewNow =
    state.mode === "replay" && state.replay ? state.replay.virtualMs : state.mode === "scrub" && state.cursor !== null ? state.cursor : now;

  // The wall shows one hotel and cannot scroll: no boards of the other hotels, and lanes capped to what fits.
  const otherBoards = !wall && state.mode === "live" && !demo.running ? initial.hotels : undefined;
  const laneCap = wall ? WALL_LANE_CARDS : undefined;
  const wallPaging = wall ? WALL_PAGING : undefined;

  // The detail of a record is today's: it is read only while the screen shows the live state (not a scrub, a replay or a demo).
  const detailLive = state.mode === "live" && !demo.running;
  const openRecord = (kind: RadarRecord["kind"]) => (record?.kind === kind ? record.id : null);
  const selectRecord = (kind: RadarRecord["kind"]) => (id: string | null) => setRecord(id ? { kind, id } : null);

  // The path, general to specific; every level above the current one is a way back up.
  const pathUp: Record<string, () => void> = {
    all: () => pickHotel("ALL", null),
    hotel: () => {
      setChoice("genel");
      setFloorId(undefined);
      setRecord(null);
    },
    view: () => {
      setFloorId(undefined);
      setRecord(null);
    },
    place: () => setRecord(null),
  };
  const pathLevels: PathLevel[] = pathSteps({
    multi: initial.hotels.length > 1,
    all,
    hotelName,
    view,
    viewLabel: VIEW_LABELS[view],
    snap,
    outletId: activeOutletId,
    floorId,
    record,
  }).map((s) => ({ key: s.key, label: s.label, onSelect: pathUp[s.key] }));
  const floors = floorOptions(view, snap);
  const pathPlace: PathPlace | undefined =
    !all && floors.length > 1
      ? {
          label: "Kat",
          value: floors.some((f) => f.id === floorId) ? (floorId ?? "") : "",
          allLabel: "Tüm katlar",
          options: floors,
          onChange: (id) => {
            setFloorId(id || undefined);
            // The open record may not be on the floor that was picked.
            if (VIEW_RECORD[view] !== "table") setRecord(null);
          },
        }
      : undefined;

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
          onOpenView={(id, v) => (id === hotelId ? goView(v) : pickHotel(id, v))}
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
    body = (
      <Floor
        view={snap}
        now={viewNow}
        onOpenApp={openApp}
        paging={wallPaging}
        floorId={floorId}
        recordDetail={detailLive}
        selectedRoomId={openRecord("room")}
        onSelectRoom={selectRecord("room")}
      />
    );
  } else if (view === "masa" && snap) {
    body = (
      <Tables
        view={snap}
        now={viewNow}
        outletId={activeOutletId}
        onSelectOutlet={setOutletId}
        onOpenApp={openApp}
        recordDetail={detailLive}
        selectedTableId={openRecord("table")}
        onSelectTable={selectRecord("table")}
      />
    );
  } else if (view === "kuyruk" && snap) {
    body = (
      <Queues
        view={snap}
        now={viewNow}
        paging={wallPaging}
        onOpenOutlet={(id) => {
          setOutletId(id);
          if (views.includes("masa")) goView("masa");
        }}
      />
    );
  } else if (view === "odaServisi" && snap) {
    // Live only: the other hotels' boards cannot follow a scrub, a replay or a demo of this one.
    body = (
      <RoomService
        view={snap}
        now={viewNow}
        onOpenApp={openApp}
        hotels={otherBoards}
        maxCards={laneCap}
        roomNumbers={floorRoomNumbers(snap, floorId)}
        recordDetail={detailLive}
        selectedOrderId={openRecord("order")}
        onSelectOrder={selectRecord("order")}
      />
    );
  } else if (view === "mybar" && snap) {
    // Live only, as the room service boards: the other hotels cannot follow a scrub, a replay or a demo.
    body = <Mybar view={snap} now={viewNow} hotels={otherBoards} maxCards={laneCap} floorId={floorId} focusRoomId={openRecord("room")} />;
  } else if (view === "personel" && snap) {
    body = <Staff view={snap} now={viewNow} nameStyle={wall ? "short" : "full"} paging={wallPaging} />;
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
              onToggleSound={toggleSound}
              onWakeLockStatus={setWakeLockAvailable}
              wakeLockAvailable={wakeLockAvailable}
              onExit={exitToApp}
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
            onView={goView}
            connection={connection}
            motion={{
              on: animationOn,
              reduced: motionPref.reduced,
              onToggle: toggleMotion,
              hint: all ? "Animasyon otel görünümünde çalışır: ilk otele geçip açar" : undefined,
            }}
            sound={{
              enabled: soundEnabled,
              onToggle: toggleSound,
            }}
            demo={{
              enabled: demoModeActive,
              running: demo.running,
              disabled: state.mode === "replay" && !demo.running,
              hint:
                state.mode === "replay" && !demo.running
                  ? "Gün tekrarı sürerken demo başlatılamaz"
                  : "Bir modül seçip örnek bir gün senaryosunu oynat",
              focusLabel: demo.focus ? DEMO_FOCUS_SHORT[demo.focus] : undefined,
              onStart: () => setDemoDialog(true),
              onStop: demo.stop,
            }}
            modeText={
              state.mode === "replay" && state.replay
                ? `${demo.running ? "Demo" : "Tekrar"} ${clock(state.replay.virtualMs)}`
                : state.mode === "scrub" && state.cursor
                  ? `Geçmiş ${clock(state.cursor)}`
                  : CONNECTION_TEXT[connection]
            }
          />
          {!wall && loaded ? <PathBar idPrefix={idPrefix} levels={pathLevels} place={pathPlace} /> : null}
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
                {demo.running ? "Demo senaryosu" : `Tekrar · ${state.replay.day}`} · {clock(state.replay.virtualMs)} · {state.replay.speed}×
              </span>
              <button type="button" className="rd-chip" onClick={() => (demo.running ? demo.stop() : store.getState().exitReplay())}>
                {demo.running ? "Demoyu durdur" : "Canlıya dön (Esc)"}
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
            {!all ? (
              <Ticker
                events={visibleEvents}
                state={snap}
                mode={wall ? "wall" : "window"}
                nameStyle={wall ? "short" : "full"}
                onSelect={focusEvent}
              />
            ) : null}
          </div>
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
          {demoDialog ? (
            <DemoDialog
              hotels={initial.hotels}
              defaultHotelId={all ? (initial.hotels[0]?.id ?? "") : hotelId}
              onStart={beginDemo}
              onCancel={() => setDemoDialog(false)}
            />
          ) : null}
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
