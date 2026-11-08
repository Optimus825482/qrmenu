// Client-only demo of the radar: a scripted ~30 minute stretch of a hotel day that plays at 10x (about 3 minutes).
// Pure and deterministic from a seed. It builds a snapshot plus RadarEvents and nothing else: no server action,
// database or realtime module is imported, and nothing is written or published anywhere.
import { compareRadarEvents } from "../../events";
import type { RadarConfig, RadarEvent, RadarSnapshot } from "../../types";

/** Virtual length of the script (minutes); at the default 10x speed it plays for DEMO_SPAN_MIN / 10 minutes. */
export const DEMO_SPAN_MIN = 30;
export const DEMO_SPEED = 10 as const;
/** The module a focused scenario is about. */
export type DemoFocus = "MINIBAR" | "OUTLET" | "ROOM_SERVICE";
export const DEMO_FOCUS_LABELS: Record<DemoFocus, string> = {
  MINIBAR: "Minibar",
  OUTLET: "Outlet (QR Sipariş)",
  ROOM_SERVICE: "Oda Servisi",
};
/** Short module name for the DEMO badge. */
export const DEMO_FOCUS_SHORT: Record<DemoFocus, string> = {
  MINIBAR: "Minibar",
  OUTLET: "Outlet",
  ROOM_SERVICE: "Oda Servisi",
};
/** A focused script runs at half the virtual time, so its first events come within seconds. */
const FOCUS_TIME_SCALE = 0.5;
/** Virtual length of a focused script (minutes). */
const FOCUS_SPAN_MIN = 20;
/** Share of events of the other modules kept next to the focused one (at most). */
const FOCUS_BACKGROUND_SHARE = 0.25;
/** Event types that stand alone (no earlier event needed), so thinning the background never breaks a lifecycle. */
const BACKGROUND_TYPES: ReadonlySet<string> = new Set([
  "presence",
  "mail.failed",
  "room.scanned",
  "table.scanned",
  "stock.level",
  "task.generated",
  "upload.status",
]);

function moduleOf(e: RadarEvent): DemoFocus | null {
  if (e.layer === "MINIBAR") return "MINIBAR";
  if (e.layer === "ODA_SERVISI") return "ROOM_SERVICE";
  if (e.layer === "SIPARIS" || e.type === "printer.health") return "OUTLET";
  return null;
}

/** Slack after the last event so the final state stays on screen for a moment. */
const TAIL_SEC = 20;

export type DemoScenario = {
  hotelId: string;
  /** Business date label of the replay header. */
  day: string;
  startMs: number;
  /** Virtual end of the script (last event plus the tail). */
  endMs: number;
  /** "HH:MM" bounds handed to the replay store so its span matches the script. */
  from: string;
  to: string;
  snapshot: RadarSnapshot;
  events: RadarEvent[];
};

export type DemoOptions = {
  hotelId: string;
  /** Virtual start of the script (the replay snapshot time). */
  startMs: number;
  seed?: number;
  /** The loaded live snapshot; its ids are reused. Absent: a small built-in fake hotel. */
  base?: RadarSnapshot | null;
  /** Weights about 80% of the events to one module; a few standalone events of the others stay as background. */
  focus?: DemoFocus;
};

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
type Draft = DistributiveOmit<RadarEvent, "id" | "at" | "hotelId">;

/** Small seeded PRNG (mulberry32): the same seed always scripts the same day. */
export function createRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DEMO_CONFIG: RadarConfig = {
  liveBufferMinutes: 30,
  idleMinutes: 15,
  mybarStaleMinutes: 12,
  callAlertSeconds: 120,
  approvalEscalationMinutes: 4,
  slaMinutes: 20,
  wallRotateSeconds: 20,
  wallViews: ["genel", "kat", "masa", "kuyruk"],
  soundOnEscalation: false,
  replayRetentionDays: 90,
};

const DEMO_PEOPLE: [string, string][] = [
  ["demo-u1", "Demo Garson"],
  ["demo-u2", "Demo Kat Sorumlusu"],
  ["demo-u3", "Demo Mutfak"],
  ["demo-u4", "Demo Yönetici"],
];

const dayOf = (ms: number): string =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Nicosia", year: "numeric", month: "2-digit", day: "2-digit" }).format(
    new Date(ms),
  );

/** A small hotel used when no live snapshot has been loaded (offline, still loading). */
export function fakeDemoSnapshot(hotelId: string, startMs: number): RadarSnapshot {
  const rooms = (floor: number) =>
    Array.from({ length: 8 }, (_, i) => ({
      roomId: `demo-room-${floor}${i + 1}`,
      number: `${floor}0${i + 1}`,
      occupied: i % 4 !== 3,
      task: { itemId: `demo-task-demo-room-${floor}${i + 1}`, type: "INHOUSE_KONTROL" as const, status: "BEKLIYOR" as const, priority: 1 },
      checkedToday: null,
      dnd: null,
      mybar: null,
    }));
  const tables = (outlet: string, n: number) =>
    Array.from({ length: n }, (_, i) => ({
      tableId: `demo-${outlet}-t${i + 1}`,
      label: `${i + 1}`,
      orders: [],
      call: null,
    }));
  const iso = new Date(startMs).toISOString();
  return {
    generatedAt: iso,
    hotelId,
    businessDate: dayOf(startMs),
    layers: {
      minibar: {
        floors: [1, 2].map((n) => ({ floorId: `demo-floor-${n}`, number: n, name: `${n}. Kat`, rooms: rooms(n) })),
        supervisors: [
          { userId: "demo-u2", name: "Demo Kat Sorumlusu", floorIds: ["demo-floor-1", "demo-floor-2"], done: 0, total: 16 },
        ],
        stock: [
          { productId: "demo-p1", name: "Su 0,5 L", remaining: 12, critical: 10 },
          { productId: "demo-p2", name: "Kola", remaining: 9, critical: 8 },
          { productId: "demo-p3", name: "Fındık paketi", remaining: 7, critical: 6 },
        ],
        uploads: [{ kind: "DOLULUK", status: "BEKLIYOR" }],
      },
      order: {
        outlets: [
          {
            outletId: "demo-outlet-1",
            name: "Ana Restoran",
            type: "SALON",
            orderingEnabled: true,
            areas: [{ areaId: "demo-area-1", name: "Salon", tables: tables("1", 8) }],
            queues: {
              kasa: { count: 0 },
              kds: { YENI: { count: 0 }, HAZIRLANIYOR: { count: 0 }, HAZIR: { count: 0 } },
              print: { KUYRUKTA: 0, BASILIYOR: 0, HATA: 0 },
              jobs: [],
            },
            printers: [{ printerId: "demo-printer-1", name: "Mutfak Yazıcısı", state: "HAZIR", lastSeenAt: iso }],
          },
        ],
      },
      roomService: { slaMinutes: DEMO_CONFIG.slaMinutes, orders: [] },
      staff: {
        sessions: DEMO_PEOPLE.map(([userId, name], i) => ({
          sessionId: `demo-s${i + 1}`,
          userId,
          name,
          roleCode: "DEMO",
          roleKind: i === 3 ? ("YONETIM" as const) : ("OUTLET" as const),
          status: "ONLINE" as const,
          loginAt: iso,
          lastSeenAt: iso,
        })),
      },
      system: { alerts: [], mailFailed: 0 },
    },
    people: Object.fromEntries(DEMO_PEOPLE),
    config: DEMO_CONFIG,
    sparkline: [],
  };
}

/** Copy of the live snapshot with everything transient cleared, so the script starts from a calm day. */
function calmSnapshot(base: RadarSnapshot, hotelId: string, startMs: number): RadarSnapshot {
  const snap = JSON.parse(JSON.stringify(base)) as RadarSnapshot;
  snap.hotelId = hotelId;
  snap.generatedAt = new Date(startMs).toISOString();
  snap.businessDate = dayOf(startMs);
  snap.sparkline = [];
  snap.layers.system = { alerts: [], mailFailed: 0 };
  const mb = snap.layers.minibar;
  if (mb) {
    for (const f of mb.floors)
      for (const r of f.rooms) {
        r.task = { itemId: `demo-task-${r.roomId}`, type: "INHOUSE_KONTROL", status: "BEKLIYOR", priority: 1 };
        r.checkedToday = null;
        r.dnd = null;
        r.mybar = null;
        delete r.scannedAt;
      }
    for (const s of mb.supervisors) {
      s.done = 0;
      delete s.lastRoomId;
      delete s.lastAt;
    }
    mb.uploads = [{ kind: "DOLULUK", status: "BEKLIYOR" }];
    // The stock list holds near-critical products only (remaining <= 1.2 x critical); the script lowers three of them.
    if (mb.stock.length === 0) {
      mb.stock = [
        { productId: "demo-p1", name: "Su 0,5 L", remaining: 12, critical: 10 },
        { productId: "demo-p2", name: "Kola", remaining: 9, critical: 8 },
        { productId: "demo-p3", name: "Fındık paketi", remaining: 7, critical: 6 },
      ];
    } else {
      mb.stock = mb.stock.slice(0, 3).map((x) => ({ ...x, critical: Math.max(2, x.critical), remaining: Math.max(2, x.critical) + 1 }));
    }
  }
  const order = snap.layers.order;
  if (order) {
    for (const o of order.outlets) {
      o.orderingEnabled = true;
      for (const a of o.areas)
        for (const t of a.tables) {
          t.orders = [];
          t.call = null;
          delete t.scannedAt;
        }
      o.queues = {
        kasa: { count: 0 },
        kds: { YENI: { count: 0 }, HAZIRLANIYOR: { count: 0 }, HAZIR: { count: 0 } },
        print: { KUYRUKTA: 0, BASILIYOR: 0, HATA: 0 },
        jobs: [],
      };
      for (const p of o.printers) p.state = "HAZIR";
    }
  }
  if (snap.layers.roomService) snap.layers.roomService.orders = [];
  if (snap.layers.staff && snap.layers.staff.sessions.length === 0) {
    snap.layers.staff.sessions = DEMO_PEOPLE.map(([userId, name], i) => ({
      sessionId: `demo-s${i + 1}`,
      userId,
      name,
      roleCode: "DEMO",
      roleKind: "OUTLET" as const,
      status: "ONLINE" as const,
      loginAt: snap.generatedAt,
      lastSeenAt: snap.generatedAt,
    }));
    snap.people = { ...(snap.people ?? {}), ...Object.fromEntries(DEMO_PEOPLE) };
  }
  return snap;
}

/**
 * Builds the demo: the (cleaned) snapshot at `startMs` and the events that follow it. Ids come from the live
 * snapshot when there is one, so the floor and table views animate the cells the user already sees.
 */
export function buildDemoScenario(opts: DemoOptions): DemoScenario {
  const { hotelId, startMs } = opts;
  const rng = createRng(opts.seed ?? 20261107);
  const snapshot = opts.base ? calmSnapshot(opts.base, hotelId, startMs) : fakeDemoSnapshot(hotelId, startMs);
  const events: RadarEvent[] = [];
  const { focus } = opts;
  const timeScale = focus ? FOCUS_TIME_SCALE : 1;
  let seq = 0;
  const add = (virtualSec: number, draft: Draft): void => {
    const sec = virtualSec * timeScale;
    seq += 1;
    events.push({
      ...draft,
      id: `demo:${String(seq).padStart(3, "0")}:${draft.type}`,
      at: new Date(startMs + Math.round(sec * 1000)).toISOString(),
      hotelId,
    } as RadarEvent);
  };

  const shuffle = <T>(xs: readonly T[]): T[] => {
    const out = xs.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  };
  // Jitter in seconds, so repeated beats do not land on a grid.
  const jit = (max: number): number => Math.round(rng() * max);

  const L = snapshot.layers;
  const people = Object.entries(snapshot.people ?? {});
  const staff = L.staff?.sessions ?? [];
  const actor = (i: number): string | undefined => (people.length > 0 ? people[i % people.length][0] : undefined);
  const by = (i: number): { byUserId?: string } => {
    const id = actor(i);
    return id ? { byUserId: id } : {};
  };

  // ───────── MINIBAR: room checks, DND, MyBar, tasks, stock, occupancy upload ─────────
  const mb = L.minibar;
  if (mb) {
    const rooms = mb.floors.flatMap((f) => f.rooms);
    const occupied = shuffle(rooms.filter((r) => r.occupied));
    const empty = shuffle(rooms.filter((r) => !r.occupied));
    const pool = [...occupied, ...empty];
    const room = (i: number) => pool[i % pool.length];
    const supervisor = mb.supervisors[0]?.userId;

    add(2, { type: "upload.status", layer: "MINIBAR", kind: "DOLULUK", status: "ISLENIYOR" });
    add(14, { type: "upload.status", layer: "MINIBAR", kind: "DOLULUK", status: "TAMAMLANDI" });
    add(16, { type: "task.generated", layer: "MINIBAR", date: snapshot.businessDate, itemCount: Math.min(rooms.length, 24) });

    // Nine rooms (fourteen when Minibar is the focus) checked across the first twenty minutes: scan, then the check with its task.
    for (let i = 0; i < (focus === "MINIBAR" ? 14 : 9); i++) {
      const r = room(i);
      const t = 30 + i * 120 + jit(40);
      add(t, { type: "room.scanned", layer: "MINIBAR", roomId: r.roomId });
      add(t + 8, { type: "task.updated", layer: "MINIBAR", taskItemId: `demo-task-${r.roomId}`, roomId: r.roomId, to: "DEVAM" });
      add(t + 25, {
        type: "room.checked",
        layer: "MINIBAR",
        roomId: r.roomId,
        checkType: i % 3 === 0 ? "SARFIYAT_YOK" : "URUN_EKLENDI",
        taskStatus: "TAMAMLANDI",
        ...(supervisor ? { byUserId: supervisor } : by(i)),
      });
      if (i === 4) add(t + 40, { type: "room.check.changed", layer: "MINIBAR", roomId: r.roomId, op: "DUZELT", ...by(i) });
    }

    // DND: one room completes its repeated visits, one is left behind and reported missed.
    const dndDone = room(10);
    const dndOpen = room(11);
    add(200, { type: "room.checked", layer: "MINIBAR", roomId: dndDone.roomId, checkType: "DND", ...by(1) });
    add(201, { type: "dnd.marked", layer: "MINIBAR", roomId: dndDone.roomId, count: 1, minChecks: 2, status: "AKTIF" });
    add(620, { type: "dnd.marked", layer: "MINIBAR", roomId: dndDone.roomId, count: 2, minChecks: 2, status: "TAMAMLANDI" });
    add(260, { type: "room.checked", layer: "MINIBAR", roomId: dndOpen.roomId, checkType: "DND", ...by(2) });
    add(261, { type: "dnd.marked", layer: "MINIBAR", roomId: dndOpen.roomId, count: 1, minChecks: 2, status: "AKTIF" });
    add(1500, { type: "dnd.missed", layer: "MINIBAR", roomIds: [dndOpen.roomId] });

    // MyBar requests: fulfilled, closed short, cancelled, and one that waits until it turns into an alert.
    const myBar: [number, number, number, "TAMAM" | "EKSIK" | "IPTAL" | null][] = [
      [90, 150, 360, "TAMAM"],
      [300, 380, 700, "EKSIK"],
      [520, 640, 900, "IPTAL"],
      [760, 1200, 0, null],
    ];
    myBar.forEach(([open, seen, close, outcome], i) => {
      const r = room(12 + i);
      const requestId = `demo-mybar-${i + 1}`;
      add(open, { type: "mybar.opened", layer: "MINIBAR", requestId, roomId: r.roomId });
      add(seen, { type: "mybar.seen", layer: "MINIBAR", requestId, roomId: r.roomId, ...by(i) });
      if (outcome) add(close, { type: "mybar.closed", layer: "MINIBAR", requestId, roomId: r.roomId, outcome, ...by(i) });
    });

    // Stock: two products slide below the critical level, one is refilled.
    const stock = mb.stock;
    stock.slice(0, 3).forEach((p, i) => {
      const steps = [Math.floor(p.critical * 1.2), p.critical, Math.max(0, p.critical - 2)];
      const at = [180 + i * 90, 700 + i * 80, 1100 + i * 60];
      steps.forEach((remaining, k) => {
        if (i === 2 && k === 2) remaining = p.critical * 4; // refilled: leaves the near-critical list
        add(at[k], { type: "stock.level", layer: "MINIBAR", productId: p.productId, remaining, critical: p.critical });
      });
    });
  }

  // ───────── SIPARIS: tables, orders, calls, printers, ordering switch ─────────
  const ord = L.order;
  if (ord) {
    const outlets = ord.outlets.filter((o) => o.areas.some((a) => a.tables.length > 0));
    const tablesOf = (o: (typeof outlets)[number]) => o.areas.flatMap((a) => a.tables);
    let orderNo = 700;
    let jobNo = 0;
    outlets.slice(0, 2).forEach((outlet, oi) => {
      const tables = shuffle(tablesOf(outlet));
      const printer = outlet.printers[0];
      const waiter = (i: number) => actor(i);
      const base = oi * 25;

      // Seven table orders (ten when Outlet is the focus) walk the whole kitchen path; two of them also print.
      for (let i = 0; i < Math.min(focus === "OUTLET" ? 10 : 7, tables.length); i++) {
        const tb = tables[i];
        const orderId = `demo-order-${oi}-${i}`;
        const no = ++orderNo;
        const t = base + 40 + i * 190 + jit(30);
        const common = { layer: "SIPARIS" as const, outletId: outlet.outletId, orderId, orderNo: no, kind: "MASA" as const, tableId: tb.tableId };
        add(t - 25, { type: "table.scanned", layer: "SIPARIS", tableId: tb.tableId });
        const w = waiter(i);
        if (i < 4) add(t - 20, { type: "table.assigned", layer: "SIPARIS", tableId: tb.tableId, waiterId: w ?? null });
        add(t, { type: "order.status", ...common, to: "GONDERILDI" });
        if (i === 5) {
          // Never approved in time: it escalates and raises the approval alert.
          add(t + 280, { type: "order.escalated", layer: "SIPARIS", outletId: outlet.outletId, orderId, orderNo: no });
          add(t + 420, { type: "order.status", ...common, from: "GONDERILDI", to: "ONAYLANDI", ...(w ? { waiterId: w } : {}) });
          continue;
        }
        add(t + 35, { type: "order.status", ...common, from: "GONDERILDI", to: "ONAYLANDI", ...(w ? { waiterId: w } : {}) });
        add(t + 70, { type: "order.status", ...common, from: "ONAYLANDI", to: "ONAYLANDI", prep: true });
        add(t + 150, { type: "order.status", ...common, from: "ONAYLANDI", to: "HAZIR" });
        add(t + 200, { type: "order.status", ...common, from: "HAZIR", to: "SERVIS_EDILDI" });
        if (printer && i < 2) {
          const jobId = `demo-job-${oi}-${++jobNo}`;
          const pr = { layer: "SIPARIS" as const, outletId: outlet.outletId, printerId: printer.printerId, orderId, jobId };
          add(t + 2, { type: "print.job", ...pr, status: "KUYRUKTA" });
          add(t + 5, { type: "print.job", ...pr, status: "BASILIYOR" });
          add(t + 9, { type: "print.job", ...pr, status: "BASILDI" });
        }
      }

      // Calls: one answered quickly, one that stays open long enough to alert.
      const t1 = tables[tables.length - 1];
      const t2 = tables[tables.length - 2] ?? t1;
      add(base + 120, { type: "call.opened", layer: "SIPARIS", callId: `demo-call-${oi}-1`, tableId: t1.tableId, callType: "GARSON" });
      add(base + 170, { type: "call.closed", layer: "SIPARIS", callId: `demo-call-${oi}-1`, tableId: t1.tableId, waiterName: "Ahmet Yılmaz" });
      add(base + 640, { type: "call.opened", layer: "SIPARIS", callId: `demo-call-${oi}-2`, tableId: t2.tableId, callType: "HESAP" });
      if (oi === 1) add(base + 1000, { type: "call.closed", layer: "SIPARIS", callId: `demo-call-${oi}-2`, tableId: t2.tableId, waiterName: "Mehmet Demir" });

      // A print job that fails, and the printer that goes quiet and returns.
      if (printer) {
        const failJob = `demo-job-${oi}-fail`;
        const failOrder = `demo-order-${oi}-fail`;
        const fp = { layer: "SIPARIS" as const, outletId: outlet.outletId, printerId: printer.printerId, orderId: failOrder, jobId: failJob };
        add(base + 830, { type: "print.job", ...fp, status: "KUYRUKTA" });
        add(base + 836, { type: "print.job", ...fp, status: "BASILIYOR" });
        add(base + 842, { type: "print.job", ...fp, status: "HATA", reason: "BASILAMADI" });
        add(base + 845, { type: "printer.health", layer: "SISTEM", printerId: printer.printerId, state: "HATA" });
        add(base + 1130, { type: "printer.health", layer: "SISTEM", printerId: printer.printerId, state: "HAZIR" });
      }
    });
    const first = outlets[0];
    if (first) {
      add(1250, { type: "outlet.ordering", layer: "SIPARIS", outletId: first.outletId, enabled: false });
      add(1330, { type: "outlet.ordering", layer: "SIPARIS", outletId: first.outletId, enabled: true });
    }
  }

  // ───────── ODA_SERVISI: three orders (ten when it is the focus), some slide from WARN to BREACH ─────────
  const allRooms = mb?.floors.flatMap((f) => f.rooms) ?? [];
  // Occupancy is often not loaded yet; a Room Service demo then uses any room rather than showing nothing.
  const occupiedRooms = allRooms.filter((r) => r.occupied);
  const rsRooms = occupiedRooms.length === 0 && focus === "ROOM_SERVICE" ? allRooms : occupiedRooms;
  if (L.roomService && rsRooms.length > 0) {
    const pool = shuffle(rsRooms);
    const rs = focus === "ROOM_SERVICE" ? Array.from({ length: 10 }, (_, i) => pool[i % pool.length]) : pool.slice(0, 3);
    let no = 4400;
    rs.forEach((r, i) => {
      const orderId = `demo-rs-${i}`;
      const orderNo = ++no;
      const t = 100 + i * (focus === "ROOM_SERVICE" ? 150 : 330) + jit(40);
      const common = { layer: "ODA_SERVISI" as const, orderId, orderNo, kind: "ODA_SERVISI" as const, roomId: r.roomId };
      add(t, { type: "order.status", ...common, to: "TEYIT_BEKLIYOR" });
      add(t + 45, { type: "order.status", ...common, from: "TEYIT_BEKLIYOR", to: "ONAYLANDI" });
      if (i % 4 === 0) {
        add(t + 700, { type: "order.sla", layer: "ODA_SERVISI", orderId, orderNo, level: "WARN" });
        add(t + 1000, { type: "order.sla", layer: "ODA_SERVISI", orderId, orderNo, level: "BREACH" });
        add(t + 1150, { type: "order.status", ...common, from: "ONAYLANDI", to: "YOLDA" });
        add(t + 1290, { type: "order.status", ...common, from: "YOLDA", to: "TESLIM_EDILDI" });
      } else {
        add(t + 240, { type: "order.status", ...common, from: "ONAYLANDI", to: "HAZIR" });
        add(t + 330, { type: "order.status", ...common, from: "HAZIR", to: "YOLDA" });
        add(t + 420, { type: "order.status", ...common, from: "YOLDA", to: "TESLIM_EDILDI" });
      }
    });
  }

  // ───────── PERSONEL: presence ─────────
  if (L.staff && staff.length > 0) {
    staff.slice(0, 4).forEach((s, i) => {
      const t = 60 + i * 140;
      add(t, { type: "presence", layer: "PERSONEL", sessionId: s.sessionId, userId: s.userId, status: "ONLINE", place: "Radar demo", lastSeenAt: new Date(startMs + t * 1000).toISOString() });
      // Normalised presence.tick: no user, only a fresh lastSeenAt.
      const tick = t + 300;
      add(tick, { type: "presence", layer: "PERSONEL", sessionId: s.sessionId, userId: "", status: "ONLINE", lastSeenAt: new Date(startMs + tick * 1000).toISOString() });
    });
    const idle = staff[staff.length - 1];
    add(900, { type: "presence", layer: "PERSONEL", sessionId: idle.sessionId, userId: idle.userId, status: "BOSTA" });
    add(1400, { type: "presence", layer: "PERSONEL", sessionId: idle.sessionId, userId: idle.userId, status: "ONLINE", lastSeenAt: new Date(startMs + 1400_000).toISOString() });
    if (staff.length > 1) add(1700, { type: "presence", layer: "PERSONEL", sessionId: staff[0].sessionId, userId: staff[0].userId, status: "CIKTI" });
  }

  // ───────── SISTEM: failed mail ─────────
  add(480, { type: "mail.failed", layer: "SISTEM", kind: "RAPOR" });
  add(1180, { type: "mail.failed", layer: "SISTEM", kind: "DOLULUK" });

  if (focus) {
    const own = events.filter((e) => moduleOf(e) === focus);
    const background = events.filter((e) => moduleOf(e) !== focus && BACKGROUND_TYPES.has(e.type));
    const budget = Math.floor(own.length * FOCUS_BACKGROUND_SHARE);
    const stride = Math.max(1, background.length / Math.max(1, budget));
    const kept = new Set<RadarEvent>(own);
    for (let k = 0; k < budget && Math.floor(k * stride) < background.length; k++) kept.add(background[Math.floor(k * stride)]);
    events.splice(0, events.length, ...events.filter((e) => kept.has(e)));
  }
  events.sort(compareRadarEvents);
  const spanMinutes = focus ? FOCUS_SPAN_MIN : DEMO_SPAN_MIN;
  const lastMs = events.length > 0 ? Date.parse(events[events.length - 1].at) : startMs;
  const endMs = Math.max(lastMs + TAIL_SEC * 1000, startMs + spanMinutes * 60_000 - 1000);
  const spanMin = Math.ceil((endMs - startMs) / 60_000);
  return {
    hotelId,
    day: snapshot.businessDate,
    startMs,
    endMs,
    from: "00:00",
    to: `${String(Math.floor(spanMin / 60)).padStart(2, "0")}:${String(spanMin % 60).padStart(2, "0")}`,
    snapshot,
    events,
  };
}
