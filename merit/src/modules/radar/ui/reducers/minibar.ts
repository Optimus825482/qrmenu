import type { RadarEvent } from "../../types";
import type { RadarState } from "../../state";
import { addRefresh, replaceAt } from "./util";

type Ev<T extends RadarEvent["type"]> = Extract<RadarEvent, { type: T }>;
type Floors = NonNullable<RadarState["layers"]["minibar"]>["floors"];
type Room = Floors[number]["rooms"][number];

/** Applies `fn` to a room; missing layer = no-op, unknown room = `needsRefresh`. */
function updateRoom(s: RadarState, roomId: string, fn: (r: Room) => Room, refreshKey?: string): RadarState {
  const layer = s.layers.minibar;
  if (!layer) return s;
  for (let fi = 0; fi < layer.floors.length; fi++) {
    const floor = layer.floors[fi];
    const ri = floor.rooms.findIndex((r) => r.roomId === roomId);
    if (ri < 0) continue;
    const next = fn(floor.rooms[ri]);
    if (next === floor.rooms[ri]) return s;
    const floors = replaceAt(layer.floors, fi, { ...floor, rooms: replaceAt(floor.rooms, ri, next) });
    return { ...s, layers: { ...s.layers, minibar: { ...layer, floors } } };
  }
  return addRefresh(s, refreshKey ?? `room:${roomId}`);
}

export function reduceRoomChecked(s: RadarState, e: Ev<"room.checked">): RadarState {
  return updateRoom(s, e.roomId, (r) => {
    const task = e.taskStatus && r.task ? { ...r.task, status: e.taskStatus } : r.task;
    return { ...r, task, checkedToday: { type: e.checkType, at: e.at, userId: e.byUserId ?? "" } };
  });
}

export function reduceRoomCheckChanged(s: RadarState, e: Ev<"room.check.changed">): RadarState {
  if (e.op !== "SIL" || !s.layers.minibar) return s;
  return addRefresh(s, `room:${e.roomId}`);
}

export function reduceDndMarked(s: RadarState, e: Ev<"dnd.marked">): RadarState {
  return updateRoom(s, e.roomId, (r) => ({
    ...r,
    dnd: { count: e.count, minChecks: e.minChecks, status: e.status, lastAt: e.at },
  }));
}

export function reduceDndMissed(s: RadarState, e: Ev<"dnd.missed">): RadarState {
  if (!s.layers.minibar) return s;
  if (e.roomIds.length === 0) return addRefresh(s, "ALL");
  let cur = s;
  for (const id of e.roomIds) {
    cur = updateRoom(cur, id, (r) =>
      r.dnd?.status === "EKSIK"
        ? r
        : { ...r, dnd: { count: r.dnd?.count ?? 0, minChecks: r.dnd?.minChecks ?? 0, lastAt: e.at, status: "EKSIK" } },
    );
  }
  return cur;
}

export function reduceMybar(
  s: RadarState,
  e: Ev<"mybar.opened"> | Ev<"mybar.seen"> | Ev<"mybar.closed">,
): RadarState {
  // The room's open request, read before the close clears it: the closed list keeps its room and opening time.
  const closing =
    e.type === "mybar.closed"
      ? s.layers.minibar?.floors.flatMap((f) => f.rooms).find((r) => r.roomId === e.roomId && r.mybar?.requestId === e.requestId)
      : undefined;
  const next = updateRoom(s, e.roomId, (r) => {
    if (e.type === "mybar.opened") {
      return r.mybar?.requestId === e.requestId ? r : { ...r, mybar: { requestId: e.requestId, since: e.at, seen: false } };
    }
    if (e.type === "mybar.seen") {
      if (!r.mybar || r.mybar.seen) return r;
      return { ...r, mybar: { ...r.mybar, seen: true } };
    }
    if (!r.mybar) return r;
    // A late close of an older request must not clear a newer one.
    return !r.mybar.requestId || r.mybar.requestId === e.requestId ? { ...r, mybar: null } : r;
  });
  const layer = next.layers.minibar;
  if (e.type !== "mybar.closed" || !closing?.mybar || !layer) return next;
  if ((layer.mybarClosed ?? []).some((c) => c.requestId === e.requestId)) return next;
  const closed = { requestId: e.requestId, roomNumber: closing.number, since: closing.mybar.since, closedAt: e.at, outcome: e.outcome };
  return { ...next, layers: { ...next.layers, minibar: { ...layer, mybarClosed: [...(layer.mybarClosed ?? []), closed] } } };
}

export function reduceTaskUpdated(s: RadarState, e: Ev<"task.updated">): RadarState {
  const layer = s.layers.minibar;
  if (!layer) return s;
  const known = layer.floors.some((f) => f.rooms.some((r) => r.roomId === e.roomId && r.task));
  if (!known) return addRefresh(s, `room:${e.roomId}`);
  return updateRoom(s, e.roomId, (r) =>
    r.task && r.task.status !== e.to ? { ...r, task: { ...r.task, status: e.to } } : r,
  );
}

/** Rooms of an unknown/too-large change set cannot be derived: refetch everything. */
export function reduceTaskGenerated(s: RadarState): RadarState {
  return s.layers.minibar ? addRefresh(s, "ALL") : s;
}

export function reduceStockLevel(s: RadarState, e: Ev<"stock.level">): RadarState {
  const layer = s.layers.minibar;
  if (!layer) return s;
  const idx = layer.stock.findIndex((x) => x.productId === e.productId);
  const listed = e.remaining <= e.critical * 1.2;
  if (!listed) {
    if (idx < 0) return s;
    return { ...s, layers: { ...s.layers, minibar: { ...layer, stock: layer.stock.filter((_, i) => i !== idx) } } };
  }
  if (idx >= 0) {
    const old = layer.stock[idx];
    if (old.remaining === e.remaining && old.critical === e.critical) return s;
    const stock = replaceAt(layer.stock, idx, { ...old, remaining: e.remaining, critical: e.critical });
    return { ...s, layers: { ...s.layers, minibar: { ...layer, stock } } };
  }
  // Newly listed: the product name is not on the wire.
  const stock = [...layer.stock, { productId: e.productId, name: "", remaining: e.remaining, critical: e.critical }];
  return addRefresh({ ...s, layers: { ...s.layers, minibar: { ...layer, stock } } }, `stock:${e.productId}`);
}

export function reduceUploadStatus(s: RadarState, e: Ev<"upload.status">): RadarState {
  const layer = s.layers.minibar;
  if (!layer) return s;
  const idx = layer.uploads.findIndex((u) => u.kind === e.kind);
  const entry = { kind: e.kind, status: e.status, at: e.at };
  if (idx < 0) return { ...s, layers: { ...s.layers, minibar: { ...layer, uploads: [...layer.uploads, entry] } } };
  if (layer.uploads[idx].status === e.status) return s;
  return { ...s, layers: { ...s.layers, minibar: { ...layer, uploads: replaceAt(layer.uploads, idx, entry) } } };
}
