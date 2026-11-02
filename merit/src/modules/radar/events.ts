// Client-safe: the radar event union, the wire (SSE) contracts and the pure normaliser.
// `toRadarEvent` takes fields from a white list only; unknown payload keys (prices, notes, IPs,
// reject reasons ...) never reach a RadarEvent.
import { z } from "zod";
import type { OrderStatus } from "@/generated/prisma/client";
import type { MeritEvent } from "@/lib/realtime-events";
import type { RadarEvent, RadarLayer } from "./types";

// ───────────────────────────── wire contracts ─────────────────────────────

const TASK_STATUS = ["BEKLIYOR", "DEVAM", "TAMAMLANDI", "DND_BEKLIYOR", "EKSIK"] as const;
const TASK_TYPE = ["INHOUSE_KONTROL", "ARRIVAL_KONTROL", "DEPARTURE_KONTROL"] as const;
const DND_STATUS = ["AKTIF", "TAMAMLANDI", "IPTAL", "EKSIK"] as const;

type TaskStatusName = (typeof TASK_STATUS)[number];
type TaskTypeName = (typeof TASK_TYPE)[number];
type DndStatusName = (typeof DND_STATUS)[number];

type DndWire = {
  roomId: string;
  roomNumber: string;
  floorId: string;
  count: number;
  required: number;
  status: DndStatusName;
  byUserId: string;
};

/** Payloads of the radar-specific wire events (identifiers and counts only, never free text). */
export type Wire = {
  "roomcheck.done": {
    roomId: string;
    roomNumber: string;
    floorId: string;
    checkType: "URUN_EKLENDI" | "SARFIYAT_YOK";
    addedQty: number;
    taskItemId?: string;
    taskStatus?: TaskStatusName;
    byUserId: string;
  };
  "room.check.changed": { roomId: string; transactionId: string; op: "SIL" | "DUZELT"; byUserId: string };
  "dnd.marked": DndWire;
  "dnd.completed": DndWire;
  "dnd.missed": { date: string; roomIds: string[] };
  "mybar.created": { requestId: string; roomId: string; roomNumber: string };
  "mybar.seen": { requestId: string; roomId: string; byUserId: string };
  "mybar.completed": {
    requestId: string;
    roomId: string;
    roomNumber: string;
    closedWithMissing: boolean;
    waitSec: number;
    byUserId: string;
  };
  "mybar.cancelled": { requestId: string; roomId: string; byUserId: string };
  "task.updated": {
    items: { taskItemId: string; roomId: string; from: TaskStatusName | null; to: TaskStatusName }[];
    byUserId?: string;
    truncated?: true;
  };
  "task.generated": { day: string; types: TaskTypeName[]; itemCount: number };
  "stock.changed": { productId: string; remainingQty: number; criticalLevel: number; delta: number; type: string };
  "stock.critical": { productId: string; remainingQty: number; criticalLevel: number };
  "occupancy.uploaded": {
    uploadId: string;
    kind: string;
    status: "TAMAMLANDI" | "HATA";
    okRows: number;
    errorRows: number;
  };
  "occupancy.missing": { date: string; missingKinds: string[]; slot: "10:00" | "18:00" };
  "presence.tick": { sessions: { sessionId: string; lastSeenAt: string }[] };
  "mail.failed": { kind: string };
  "order.sla": {
    orderId: string;
    orderNo: number;
    roomId: string;
    roomNumber?: string;
    level: "WARN" | "BREACH";
    ageMin: number;
  };
  "scan.room": { roomId: string; roomNumber: string; floorId: string };
  "printer.status": { printerId: string; ok: boolean; reason?: "SESSIZ" };
};

const id = z.string().min(1).max(64);
const count = z.number().int().min(0);
const dndWire = z.strictObject({
  roomId: id,
  roomNumber: z.string().max(16),
  floorId: id,
  count,
  required: count,
  status: z.enum(DND_STATUS),
  byUserId: id,
});

/**
 * Strict schemas (unknown keys rejected): a payload carrying `price`, `note`, `ip` ... can never be
 * published through `publishRadar`.
 */
export const RADAR_WIRE: { [K in keyof Wire]: z.ZodType<Wire[K]> } = {
  "roomcheck.done": z.strictObject({
    roomId: id,
    roomNumber: z.string().max(16),
    floorId: id,
    checkType: z.enum(["URUN_EKLENDI", "SARFIYAT_YOK"]),
    addedQty: count,
    taskItemId: id.optional(),
    taskStatus: z.enum(TASK_STATUS).optional(),
    byUserId: id,
  }),
  "room.check.changed": z.strictObject({
    roomId: id,
    transactionId: id,
    op: z.enum(["SIL", "DUZELT"]),
    byUserId: id,
  }),
  "dnd.marked": dndWire,
  "dnd.completed": dndWire,
  "dnd.missed": z.strictObject({ date: z.string().max(10), roomIds: z.array(id).max(300) }),
  "mybar.created": z.strictObject({ requestId: id, roomId: id, roomNumber: z.string().max(16) }),
  "mybar.seen": z.strictObject({ requestId: id, roomId: id, byUserId: id }),
  "mybar.completed": z.strictObject({
    requestId: id,
    roomId: id,
    roomNumber: z.string().max(16),
    closedWithMissing: z.boolean(),
    waitSec: count,
    byUserId: id,
  }),
  "mybar.cancelled": z.strictObject({ requestId: id, roomId: id, byUserId: id }),
  "task.updated": z.strictObject({
    items: z
      .array(
        z.strictObject({
          taskItemId: id,
          roomId: id,
          from: z.enum(TASK_STATUS).nullable(),
          to: z.enum(TASK_STATUS),
        }),
      )
      .max(100),
    byUserId: id.optional(),
    truncated: z.literal(true).optional(),
  }),
  "task.generated": z.strictObject({
    day: z.string().max(10),
    types: z.array(z.enum(TASK_TYPE)).max(3),
    itemCount: count,
  }),
  "stock.changed": z.strictObject({
    productId: id,
    remainingQty: z.number(),
    criticalLevel: z.number(),
    delta: z.number(),
    type: z.string().max(32),
  }),
  "stock.critical": z.strictObject({ productId: id, remainingQty: z.number(), criticalLevel: z.number() }),
  "occupancy.uploaded": z.strictObject({
    uploadId: id,
    kind: z.string().max(32),
    status: z.enum(["TAMAMLANDI", "HATA"]),
    okRows: count,
    errorRows: count,
  }),
  "occupancy.missing": z.strictObject({
    date: z.string().max(10),
    missingKinds: z.array(z.string().max(32)).max(10),
    slot: z.enum(["10:00", "18:00"]),
  }),
  "presence.tick": z.strictObject({
    sessions: z.array(z.strictObject({ sessionId: id, lastSeenAt: z.string().max(40) })).max(80),
  }),
  "mail.failed": z.strictObject({ kind: z.string().max(32) }),
  "order.sla": z.strictObject({
    orderId: id,
    orderNo: count,
    roomId: id,
    roomNumber: z.string().max(16).optional(),
    level: z.enum(["WARN", "BREACH"]),
    ageMin: count,
  }),
  "scan.room": z.strictObject({ roomId: id, roomNumber: z.string().max(16), floorId: id }),
  "printer.status": z.strictObject({
    printerId: id,
    ok: z.boolean(),
    reason: z.literal("SESSIZ").optional(),
  }),
};

/** MeritEvent names the radar store subscribes to (43; `room.checked` of the spec is `roomcheck.done`). */
export const RADAR_EVENT_TYPES: readonly string[] = [
  "order.created",
  "order.confirmed",
  "order.approved",
  "order.rejected",
  "order.prep",
  "order.ready",
  "order.onway",
  "order.delivered",
  "order.served",
  "order.cancelled",
  "order.escalated",
  "order.sla",
  "call.created",
  "call.resolved",
  "assignment.changed",
  "print.queued",
  "print.printed",
  "print.failed",
  "printer.status",
  "scan.table",
  "scan.room",
  "session.changed",
  "ordering.changed",
  "settings.changed",
  "definition.changed",
  "realtime.resync",
  "mybar.created",
  "mybar.seen",
  "mybar.completed",
  "mybar.cancelled",
  "roomcheck.done",
  "room.check.changed",
  "dnd.marked",
  "dnd.completed",
  "dnd.missed",
  "task.updated",
  "task.generated",
  "stock.changed",
  "stock.critical",
  "occupancy.uploaded",
  "occupancy.missing",
  "presence.tick",
  "mail.failed",
];

// ───────────────────────────── normaliser ─────────────────────────────

export type NormalizeResult = { events: RadarEvent[]; refresh?: "ALL"; gap?: true };

/** Settings keys whose change invalidates the snapshot (besides `radar.*` and `module.*`). */
const THRESHOLD_KEYS = new Set([
  "order.approvalEscalationMinutes",
  "order.callAlertSeconds",
  "rs.slaMinutes",
  "dnd.minChecks",
  "stock.defaultCriticalLevel",
]);

type Obj = Record<string, unknown>;
const NONE: NormalizeResult = { events: [] };

const asObj = (v: unknown): Obj => (typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Obj) : {});
const str = (o: Obj, k: string): string | undefined => {
  const v = o[k];
  return typeof v === "string" && v !== "" ? v : undefined;
};
const num = (o: Obj, k: string): number | undefined => {
  const v = o[k];
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
};

const ORDER_STATUSES = new Set<string>([
  "GONDERILDI",
  "TEYIT_BEKLIYOR",
  "ONAYLANDI",
  "HAZIR",
  "YOLDA",
  "SERVIS_EDILDI",
  "TESLIM_EDILDI",
  "REDDEDILDI",
  "IPTAL",
]);
const ORDER_EVENTS = new Set([
  "order.created",
  "order.confirmed",
  "order.approved",
  "order.rejected",
  "order.prep",
  "order.ready",
  "order.onway",
  "order.delivered",
  "order.served",
  "order.cancelled",
]);
const TASK_STATUSES = new Set<string>(TASK_STATUS);
const DND_STATUSES = new Set<string>(DND_STATUS);

/** Distributive Omit: keeps the union members apart. */
type Draft = RadarEvent extends infer T ? (T extends RadarEvent ? Omit<T, "id" | "at" | "hotelId"> : never) : never;

function layerOfKind(kind: string): RadarLayer {
  return kind === "ODA_SERVISI" ? "ODA_SERVISI" : "SIPARIS";
}

/** Old payloads (created) carry no `kind`: a room reference means room service. */
function kindOf(p: Obj, e: MeritEvent): "MASA" | "ODA_SERVISI" {
  const k = str(p, "kind");
  if (k === "MASA" || k === "ODA_SERVISI") return k;
  return str(p, "roomId") || str(p, "roomNumber") || e.roomId ? "ODA_SERVISI" : "MASA";
}

/**
 * Normalises one SSE event into zero or more RadarEvents. Pure and side-effect free.
 * `refresh: "ALL"` asks the store for a new snapshot; `gap` marks a connection gap.
 */
export function toRadarEvent(e: MeritEvent | null | undefined): NormalizeResult {
  if (!e || typeof e !== "object") return NONE;
  if (e.type === "realtime.resync") return { events: [], gap: true, refresh: "ALL" };
  if (!e.hotelId) return NONE;
  const hotelId = e.hotelId;
  const p = asObj(e.payload);

  const make = (idPart: string, draft: Draft): RadarEvent =>
    ({
      id: `${e.type}:${idPart}:${e.at}`,
      at: e.at,
      hotelId,
      ...(e.outletId ? { outletId: e.outletId } : {}),
      ...draft,
    }) as RadarEvent;
  const byUserId = str(p, "byUserId");
  const by = byUserId ? { byUserId } : {};
  const truncated = e.payloadTruncated === true || p.truncated === true;
  const out = (events: RadarEvent[]): NormalizeResult =>
    truncated ? { events, refresh: "ALL" } : { events };

  if (e.type === "definition.changed") return { events: [], refresh: "ALL" };
  if (e.type === "settings.changed") {
    const key = str(p, "key");
    if (key && (key.startsWith("radar.") || key.startsWith("module.") || THRESHOLD_KEYS.has(key))) {
      return { events: [], refresh: "ALL" };
    }
    return truncated ? { events: [], refresh: "ALL" } : NONE;
  }
  if (e.payloadTruncated === true) return { events: [], refresh: "ALL" };

  if (ORDER_EVENTS.has(e.type)) {
    const orderId = str(p, "orderId");
    const orderNo = num(p, "orderNo");
    const status = str(p, "status");
    if (!orderId || orderNo === undefined || !status || !ORDER_STATUSES.has(status)) return NONE;
    // Phone confirmation publishes confirmed + approved with the same ONAYLANDI status: one is enough.
    if (e.type === "order.confirmed" && status !== "TEYIT_BEKLIYOR") return NONE;
    const kind = kindOf(p, e);
    const from = str(p, "from");
    const tableId = str(p, "tableId");
    const roomId = str(p, "roomId") ?? e.roomId;
    const waiterId = str(p, "assignedWaiterId");
    return out([
      make(orderId, {
        type: "order.status",
        layer: layerOfKind(kind),
        orderId,
        orderNo,
        kind,
        to: status as OrderStatus,
        ...(from && ORDER_STATUSES.has(from) ? { from: from as OrderStatus } : {}),
        ...(tableId ? { tableId } : {}),
        ...(roomId ? { roomId } : {}),
        ...(waiterId ? { waiterId } : {}),
        ...(e.type === "order.prep" ? { prep: true } : {}),
        ...by,
      }),
    ]);
  }

  switch (e.type) {
    case "order.escalated": {
      const orderId = str(p, "orderId");
      const orderNo = num(p, "orderNo");
      if (!orderId || orderNo === undefined) return NONE;
      return out([
        make(orderId, { type: "order.escalated", layer: layerOfKind(kindOf(p, e)), orderId, orderNo }),
      ]);
    }
    case "order.sla": {
      const orderId = str(p, "orderId");
      const orderNo = num(p, "orderNo");
      const level = str(p, "level");
      if (!orderId || orderNo === undefined || (level !== "WARN" && level !== "BREACH")) return NONE;
      const roomId = str(p, "roomId") ?? e.roomId;
      return out([
        make(`${orderId}:${level}`, {
          type: "order.sla",
          layer: "ODA_SERVISI",
          orderId,
          orderNo,
          level,
          ...(roomId ? { roomId } : {}),
        }),
      ]);
    }
    case "call.created": {
      const callId = str(p, "callId");
      const tableId = str(p, "tableId");
      const callType = str(p, "type");
      if (!callId || !tableId || (callType !== "GARSON" && callType !== "HESAP" && callType !== "DIGER")) {
        return NONE;
      }
      return out([make(callId, { type: "call.opened", layer: "SIPARIS", callId, tableId, callType })]);
    }
    case "call.resolved": {
      const callId = str(p, "callId");
      const tableId = str(p, "tableId");
      if (!callId || !tableId) return NONE;
      return out([make(callId, { type: "call.closed", layer: "SIPARIS", callId, tableId })]);
    }
    case "assignment.changed": {
      const tableId = str(p, "tableId");
      if (!tableId) return NONE;
      return out([
        make(tableId, { type: "table.assigned", layer: "SIPARIS", tableId, waiterId: str(p, "userId") ?? null }),
      ]);
    }
    case "print.queued":
    case "print.printed":
    case "print.failed": {
      const status = e.type === "print.queued" ? "KUYRUKTA" : e.type === "print.printed" ? "BASILDI" : "HATA";
      const jobId = str(p, "jobId");
      const printerId = str(p, "printerId");
      const orderId = str(p, "orderId");
      const reason = str(p, "reason");
      return out([
        make(jobId ?? orderId ?? "-", {
          type: "print.job",
          layer: "SIPARIS",
          status,
          ...(jobId ? { jobId } : {}),
          ...(printerId ? { printerId } : {}),
          ...(orderId ? { orderId } : {}),
          ...(reason === "YAZICI_YOK" || reason === "BASILAMADI" ? { reason } : {}),
        }),
      ]);
    }
    case "printer.status": {
      const printerId = str(p, "printerId");
      if (!printerId || typeof p.ok !== "boolean") return NONE;
      const state = p.ok ? "HAZIR" : str(p, "reason") === "SESSIZ" ? "SESSIZ" : "HATA";
      return out([make(printerId, { type: "printer.health", layer: "SISTEM", printerId, state })]);
    }
    case "scan.table": {
      const tableId = str(p, "tableId");
      if (!tableId) return NONE;
      return out([make(tableId, { type: "table.scanned", layer: "SIPARIS", tableId })]);
    }
    case "scan.room": {
      const roomId = str(p, "roomId") ?? e.roomId;
      if (!roomId) return NONE;
      return out([make(roomId, { type: "room.scanned", layer: "MINIBAR", roomId })]);
    }
    case "session.changed": {
      const sessionId = str(p, "sessionId");
      const userId = str(p, "userId");
      const status = str(p, "status");
      if (!sessionId || !userId || !status) return NONE;
      const outletId = str(p, "outletId") ?? e.outletId;
      return out([
        make(sessionId, {
          type: "presence",
          layer: "PERSONEL",
          sessionId,
          userId,
          status: status as "ONLINE" | "UYARI" | "CIKTI" | "DUSURULDU",
          ...(outletId ? { outletId } : {}),
        }),
      ]);
    }
    case "presence.tick": {
      const sessions = Array.isArray(p.sessions) ? p.sessions : [];
      // Touch-only presence: userId "" tells the reducer to update lastSeenAt and nothing else.
      return out(
        sessions.flatMap((raw, i) => {
          const s = asObj(raw);
          const sessionId = str(s, "sessionId");
          const lastSeenAt = str(s, "lastSeenAt");
          if (!sessionId || !lastSeenAt) return [];
          return [
            make(`${sessionId}#${i}`, {
              type: "presence",
              layer: "PERSONEL",
              sessionId,
              userId: "",
              status: "ONLINE",
              lastSeenAt,
            }),
          ];
        }),
      );
    }
    case "ordering.changed": {
      if (!e.outletId || typeof p.enabled !== "boolean") return NONE;
      return out([
        make(e.outletId, { type: "outlet.ordering", layer: "SIPARIS", outletId: e.outletId, enabled: p.enabled }),
      ]);
    }
    case "roomcheck.done": {
      const roomId = str(p, "roomId") ?? e.roomId;
      const checkType = str(p, "checkType");
      if (!roomId || (checkType !== "URUN_EKLENDI" && checkType !== "SARFIYAT_YOK")) return NONE;
      const taskStatus = str(p, "taskStatus");
      return out([
        make(roomId, {
          type: "room.checked",
          layer: "MINIBAR",
          roomId,
          checkType,
          ...(taskStatus && TASK_STATUSES.has(taskStatus) ? { taskStatus: taskStatus as never } : {}),
          ...by,
        }),
      ]);
    }
    case "room.check.changed": {
      const roomId = str(p, "roomId") ?? e.roomId;
      const op = str(p, "op");
      if (!roomId || (op !== "SIL" && op !== "DUZELT")) return NONE;
      return out([
        make(str(p, "transactionId") ?? roomId, { type: "room.check.changed", layer: "MINIBAR", roomId, op, ...by }),
      ]);
    }
    case "dnd.marked":
    case "dnd.completed": {
      const roomId = str(p, "roomId") ?? e.roomId;
      const status = str(p, "status");
      const cnt = num(p, "count");
      const minChecks = num(p, "required");
      if (!roomId || cnt === undefined || minChecks === undefined || !status || !DND_STATUSES.has(status)) {
        return NONE;
      }
      return out([
        make(roomId, {
          type: "dnd.marked",
          layer: "MINIBAR",
          roomId,
          count: cnt,
          minChecks,
          status: status as never,
          ...by,
        }),
      ]);
    }
    case "dnd.missed": {
      const date = str(p, "date");
      const roomIds = Array.isArray(p.roomIds) ? p.roomIds.filter((r): r is string => typeof r === "string") : [];
      if (!date) return NONE;
      return out([make(date, { type: "dnd.missed", layer: "MINIBAR", roomIds })]);
    }
    case "mybar.created":
    case "mybar.seen":
    case "mybar.completed":
    case "mybar.cancelled": {
      const requestId = str(p, "requestId");
      const roomId = str(p, "roomId") ?? e.roomId;
      if (!requestId || !roomId) return NONE;
      const draft: Draft =
        e.type === "mybar.created"
          ? { type: "mybar.opened", layer: "MINIBAR", requestId, roomId }
          : e.type === "mybar.seen"
            ? { type: "mybar.seen", layer: "MINIBAR", requestId, roomId, ...by }
            : e.type === "mybar.completed"
              ? {
                  type: "mybar.closed",
                  layer: "MINIBAR",
                  requestId,
                  roomId,
                  outcome: p.closedWithMissing === true ? "EKSIK" : "TAMAM",
                  ...by,
                }
              : { type: "mybar.closed", layer: "MINIBAR", requestId, roomId, outcome: "IPTAL", ...by };
      return out([make(requestId, draft)]);
    }
    case "task.updated": {
      const items = Array.isArray(p.items) ? p.items : [];
      const events = items.flatMap((raw, i) => {
        const it = asObj(raw);
        const taskItemId = str(it, "taskItemId");
        const roomId = str(it, "roomId");
        const to = str(it, "to");
        if (!taskItemId || !roomId || !to || !TASK_STATUSES.has(to)) return [];
        return [
          make(`${taskItemId}#${i}`, {
            type: "task.updated",
            layer: "MINIBAR",
            taskItemId,
            roomId,
            to: to as never,
            ...by,
          }),
        ];
      });
      return out(events);
    }
    case "task.generated": {
      const date = str(p, "day") ?? str(p, "date");
      const itemCount = num(p, "itemCount");
      if (!date || itemCount === undefined) return NONE;
      return out([make(date, { type: "task.generated", layer: "MINIBAR", date, itemCount })]);
    }
    case "stock.changed":
    case "stock.critical": {
      const rows = Array.isArray(p.items) ? p.items : [p];
      const events = rows.flatMap((raw, i) => {
        const it = asObj(raw);
        const productId = str(it, "productId");
        const remaining = num(it, "remainingQty") ?? num(it, "remaining");
        const critical = num(it, "criticalLevel") ?? num(it, "critical");
        if (!productId || remaining === undefined || critical === undefined) return [];
        return [
          make(`${productId}#${i}`, { type: "stock.level", layer: "MINIBAR", productId, remaining, critical }),
        ];
      });
      return out(events);
    }
    case "occupancy.uploaded": {
      const kind = str(p, "kind");
      const status = str(p, "status");
      if (!kind || (status !== "TAMAMLANDI" && status !== "HATA")) return NONE;
      return out([make(str(p, "uploadId") ?? kind, { type: "upload.status", layer: "MINIBAR", kind, status })]);
    }
    case "occupancy.missing": {
      const kinds = Array.isArray(p.missingKinds)
        ? p.missingKinds.filter((k): k is string => typeof k === "string" && k !== "")
        : [];
      return out(
        kinds.map((kind, i) =>
          make(`${str(p, "date") ?? "-"}:${kind}#${i}`, {
            type: "upload.status",
            layer: "MINIBAR",
            kind,
            status: "EKSIK",
          }),
        ),
      );
    }
    case "mail.failed": {
      const kind = str(p, "kind");
      if (!kind) return NONE;
      return out([make(kind, { type: "mail.failed", layer: "SISTEM", kind })]);
    }
    default:
      return NONE;
  }
}

// ───────────────────────────── ordering ─────────────────────────────

/** 0: creates an entity, 1: transition, 2: alert. Same-millisecond create + approve draws correctly. */
export function SOURCE_RANK(e: RadarEvent): 0 | 1 | 2 {
  switch (e.type) {
    case "order.status":
      return e.to === "GONDERILDI" || e.to === "TEYIT_BEKLIYOR" ? 0 : 1;
    case "call.opened":
    case "mybar.opened":
    case "task.generated":
      return 0;
    case "order.escalated":
    case "order.sla":
    case "printer.health":
    case "mail.failed":
      return 2;
    default:
      return 1;
  }
}

/** Total order shared by the live buffer and the replay stream: (at, SOURCE_RANK, id). */
export function compareRadarEvents(a: RadarEvent, b: RadarEvent): number {
  const ta = Date.parse(a.at) || 0; // NaN -> 0 keeps the order total
  const tb = Date.parse(b.at) || 0;
  if (ta !== tb) return ta - tb;
  const ra = SOURCE_RANK(a);
  const rb = SOURCE_RANK(b);
  if (ra !== rb) return ra - rb;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}
