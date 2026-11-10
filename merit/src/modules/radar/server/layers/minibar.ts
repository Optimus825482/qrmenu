// Minibar layer: floors/rooms with today's task, check, DND, MyBar and room-QR state, pool stock, uploads and
// floor-supervisor progress. Read-only; selects only the columns the snapshot carries.
import { Prisma, type DndStatus } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { UPLOAD_KINDS } from "@/modules/minibar/constants";
import type { RadarSnapshot } from "../../types";
import { nameFor, type LayerEnv } from "../config";
import { taskStatusesAt } from "./asOf";

export type MinibarLayer = NonNullable<RadarSnapshot["layers"]["minibar"]>;
type RoomEntry = MinibarLayer["floors"][number]["rooms"][number];

const SCAN_WINDOW_MS = 15 * 60_000;
const STOCK_BAND = 1.2;
const OPEN_TASK = new Set(["BEKLIYOR", "DEVAM", "DND_BEKLIYOR"]);

export async function minibarLayer(env: LayerEnv): Promise<{ layer: MinibarLayer; people: Record<string, string> }> {
  const { hotelId, todayDay, now } = env;
  const [floors, rooms, guests, taskItems, checks, dnds, mybars, stockRows, uploadRows, scans] = await Promise.all([
    prisma.floor.findMany({
      where: { hotelId, isActive: true },
      select: { id: true, number: true, name: true },
      orderBy: [{ number: "asc" }, { id: "asc" }],
    }),
    prisma.room.findMany({
      where: { hotelId, isActive: true },
      select: { id: true, number: true, floorId: true },
      orderBy: [{ number: "asc" }, { id: "asc" }],
    }),
    prisma.guestRecord.findMany({
      where: {
        hotelId,
        kind: { in: ["IN_HOUSE", "ARRIVAL"] },
        ...(env.historical ? { createdAt: { lte: now } } : {}),
        arrivalDate: { lte: todayDay },
        departureDate: { gte: todayDay },
      },
      select: { roomId: true },
      distinct: ["roomId"],
    }),
    prisma.dailyTaskItem.findMany({
      where: { task: { hotelId, date: todayDay, ...(env.historical ? { createdAt: { lte: now } } : {}) } },
      select: { id: true, roomId: true, status: true, priority: true, checkedAt: true, task: { select: { type: true } } },
    }),
    prisma.roomCheck.findMany({
      where: { checkDate: todayDay, room: { hotelId }, ...(env.historical ? { startedAt: { lte: now } } : {}) },
      select: { roomId: true, userId: true, type: true, startedAt: true, endedAt: true },
      orderBy: [{ startedAt: "desc" }, { id: "desc" }],
    }),
    prisma.roomDnd.findMany({
      where: { hotelId, date: todayDay, ...(env.historical ? { firstAt: { lte: now } } : {}) },
      select: { id: true, roomId: true, count: true, status: true, firstAt: true, lastAt: true, updatedAt: true },
    }),
    prisma.mybarRequest.findMany({
      where: env.historical
        ? // An unanswered request of an earlier business day is still open at that instant.
          { hotelId, businessDate: { lte: todayDay }, createdAt: { gte: new Date(now.getTime() - 14 * 86_400_000), lte: now } }
        : { hotelId, status: "BEKLEMEDE", businessDate: { lte: todayDay } },
      select: {
        id: true,
        roomId: true,
        createdAt: true,
        seenAt: true,
        status: true,
        completedAt: true,
        cancelledAt: true,
        updatedAt: true,
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    }),
    prisma.$queryRaw<{ product_id: string; name: string; remaining_qty: number; critical_level: number }[]>(
      env.historical
        ? // Past level = today's remaining minus the signed movements after the instant.
          Prisma.sql`
      SELECT s.product_id, s.name, s.remaining_qty, s.critical_level FROM (
        SELECT hs.product_id, p.name, hs.critical_level,
          hs.remaining_qty - COALESCE((
            SELECT SUM(m.qty) FROM hotel_stock_movements m
            WHERE m.hotel_id = hs.hotel_id AND m.product_id = hs.product_id AND m.created_at > ${now}), 0) AS remaining_qty
        FROM hotel_stocks hs JOIN products p ON p.id = hs.product_id
        WHERE hs.hotel_id = ${hotelId}
      ) s
      WHERE s.remaining_qty <= s.critical_level * ${STOCK_BAND}::numeric
      ORDER BY s.name ASC, s.product_id ASC`
        : Prisma.sql`
      SELECT hs.product_id, p.name, hs.remaining_qty, hs.critical_level
      FROM hotel_stocks hs JOIN products p ON p.id = hs.product_id
      WHERE hs.hotel_id = ${hotelId} AND hs.remaining_qty <= hs.critical_level * ${STOCK_BAND}::numeric
      ORDER BY p.name ASC, hs.product_id ASC`,
    ),
    prisma.uploadTask.findMany({
      where: { hotelId, date: todayDay, ...(env.historical ? { createdAt: { lte: now } } : {}) },
      select: { kind: true, status: true, updatedAt: true },
    }),
    prisma.qrScanLog.findMany({
      where: {
        ok: true,
        room: { hotelId },
        createdAt: { gte: new Date(now.getTime() - SCAN_WINDOW_MS), lte: now },
      },
      select: { roomId: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  if (env.historical) {
    // Past instant: rebuild the columns that only hold today's value.
    const statusAt = await taskStatusesAt(taskItems, now);
    taskItems.splice(0, taskItems.length, ...taskItems.map((t) => ({ ...t, status: statusAt(t.id, t.status) ?? t.status })));
    // A check that finished after the instant had not been done yet.
    checks.splice(0, checks.length, ...checks.filter((c) => !(c.endedAt && c.endedAt > now)));
    const rounds = dnds.length
      ? await prisma.roomDndCheck.findMany({ where: { dndId: { in: dnds.map((d) => d.id) } }, select: { dndId: true, at: true } })
      : [];
    const kept = dnds.flatMap((d) => {
      const own = rounds.filter((r) => r.dndId === d.id);
      if (own.length === 0) return [d]; // legacy row without round records: keep its own counters
      const upTo = own.filter((r) => r.at <= now);
      if (upTo.length === 0) return [];
      const lastAt = upTo.reduce((m, r) => (r.at > m ? r.at : m), upTo[0]!.at);
      const status: DndStatus =
        d.status === "EKSIK" ? (d.updatedAt <= now ? "EKSIK" : "AKTIF")
        : d.status === "TAMAMLANDI" ? (upTo.length >= env.minChecks ? "TAMAMLANDI" : "AKTIF")
        : d.status;
      return [{ ...d, count: upTo.length, lastAt, status }];
    });
    dnds.splice(0, dnds.length, ...kept);
    const open = mybars.flatMap((m) => {
      const closedAt = m.completedAt ?? m.cancelledAt ?? (m.status !== "BEKLEMEDE" ? m.updatedAt : null);
      if (closedAt && closedAt <= now) return [];
      return [{ ...m, seenAt: m.seenAt && m.seenAt <= now ? m.seenAt : null }];
    });
    mybars.splice(0, mybars.length, ...open);
    for (const u of uploadRows) {
      if (u.updatedAt > now) u.status = "BEKLIYOR";
    }
  }

  const occupied = new Set(guests.map((g) => g.roomId));
  // One task per room: an unfinished one first, then the lowest priority number.
  const taskByRoom = new Map<string, (typeof taskItems)[number]>();
  for (const t of taskItems) {
    const cur = taskByRoom.get(t.roomId);
    const better =
      !cur ||
      (OPEN_TASK.has(t.status) && !OPEN_TASK.has(cur.status)) ||
      (OPEN_TASK.has(t.status) === OPEN_TASK.has(cur.status) && t.priority < cur.priority);
    if (better) taskByRoom.set(t.roomId, t);
  }
  const checkByRoom = new Map<string, (typeof checks)[number]>();
  for (const c of checks) if (!checkByRoom.has(c.roomId)) checkByRoom.set(c.roomId, c);
  const dndByRoom = new Map(dnds.map((d) => [d.roomId, d]));
  const mybarByRoom = new Map<string, (typeof mybars)[number]>();
  for (const m of mybars) if (!mybarByRoom.has(m.roomId)) mybarByRoom.set(m.roomId, m);
  const scanByRoom = new Map<string, Date>();
  for (const s of scans) if (s.roomId && !scanByRoom.has(s.roomId)) scanByRoom.set(s.roomId, s.createdAt);

  const roomsByFloor = new Map<string, RoomEntry[]>();
  const floorOfRoom = new Map<string, string>();
  for (const r of rooms) {
    floorOfRoom.set(r.id, r.floorId);
    const task = taskByRoom.get(r.id);
    const check = checkByRoom.get(r.id);
    const dnd = dndByRoom.get(r.id);
    const mybar = mybarByRoom.get(r.id);
    const scanned = scanByRoom.get(r.id);
    const entry: RoomEntry = {
      roomId: r.id,
      number: r.number,
      occupied: occupied.has(r.id),
      task: task ? { itemId: task.id, type: task.task.type, status: task.status, priority: task.priority } : null,
      checkedToday: check
        ? { type: check.type, at: (check.endedAt ?? check.startedAt).toISOString(), userId: check.userId }
        : null,
      dnd: dnd ? { count: dnd.count, minChecks: env.minChecks, status: dnd.status, lastAt: dnd.lastAt.toISOString() } : null,
      mybar: mybar ? { requestId: mybar.id, since: mybar.createdAt.toISOString(), seen: mybar.seenAt !== null } : null,
      ...(scanned ? { scannedAt: scanned.toISOString() } : {}),
    };
    const list = roomsByFloor.get(r.floorId);
    if (list) list.push(entry);
    else roomsByFloor.set(r.floorId, [entry]);
  }

  // Floor supervisors: everyone who checked a room today, with the task progress of the floors they touched.
  const people: Record<string, string> = {};
  const byUser = new Map<string, { floors: Set<string>; last: (typeof checks)[number] }>();
  for (const c of checks) {
    const floorId = floorOfRoom.get(c.roomId);
    if (!floorId) continue;
    const cur = byUser.get(c.userId);
    if (cur) cur.floors.add(floorId);
    else byUser.set(c.userId, { floors: new Set([floorId]), last: c });
  }
  const users = byUser.size
    ? await prisma.user.findMany({ where: { id: { in: [...byUser.keys()] } }, select: { id: true, fullName: true } })
    : [];
  const fullName = new Map(users.map((u) => [u.id, u.fullName]));
  const progressOf = (floorIds: Set<string>) => {
    let done = 0;
    let total = 0;
    for (const t of taskItems) {
      const f = floorOfRoom.get(t.roomId);
      if (!f || !floorIds.has(f)) continue;
      total++;
      if (t.status === "TAMAMLANDI") done++;
    }
    return { done, total };
  };
  const supervisors: MinibarLayer["supervisors"] = [...byUser.entries()]
    .map(([userId, v]) => {
      const name = fullName.get(userId) ?? "";
      if (env.named && name) people[userId] = name;
      return {
        userId,
        name: nameFor(env, name),
        floorIds: [...v.floors].sort(),
        ...progressOf(v.floors),
        lastRoomId: v.last.roomId,
        lastAt: (v.last.endedAt ?? v.last.startedAt).toISOString(),
      };
    })
    .sort((a, b) => (a.userId < b.userId ? -1 : 1));

  const uploadByKind = new Map(uploadRows.map((u) => [u.kind, u]));
  const uploads: MinibarLayer["uploads"] = UPLOAD_KINDS.map((kind) => {
    const row = uploadByKind.get(kind);
    // A pending daily task (BEKLIYOR) means the file has not arrived yet, same as no task at all.
    if (!row || row.status === "BEKLIYOR") return { kind, status: "EKSIK" as const };
    return { kind, status: row.status, at: row.updatedAt.toISOString() };
  });

  return {
    layer: {
      floors: floors.map((f) => ({
        floorId: f.id,
        number: f.number,
        name: f.name,
        rooms: roomsByFloor.get(f.id) ?? [],
      })),
      supervisors,
      stock: stockRows.map((s) => ({
        productId: s.product_id,
        name: s.name,
        remaining: Number(s.remaining_qty),
        critical: Number(s.critical_level),
      })),
      uploads,
    },
    people,
  };
}
