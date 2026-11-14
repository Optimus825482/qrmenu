import { z } from "zod";
import type { Prisma, RoomServiceCoverageMode } from "@/generated/prisma/client";
import type { Ctx } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { publish } from "@/lib/realtime";
import { assertCan, can } from "@/lib/rbac";
import { DomainError, fromZod } from "@/lib/result";
import { mayManageRole } from "@/modules/core/roleRanks";
import { audit } from "@/modules/core/server/audit";

/*
 * Cross-hotel room-service coverage ("oteller arası izleme / işleme", 12 Kas 2026).
 *
 * A grant says: user U may watch (IZLEME) or also process (ISLEME) the room-service requests of hotel H, a
 * hotel outside U's own scope, from `startsAt` until `endsAt` (null = until revoked).
 *
 *  - A grant never widens `ctx.hotelIds`. Nothing but the room-service paths (covered board, order
 *    transitions, the SSE scope, new-order notifications) asks this module, each with an explicit check.
 *  - Validity is evaluated at every use against the clock: `revokedAt IS NULL`, `startsAt <= now`,
 *    `endsAt IS NULL OR now < endsAt`. Nothing is cached across requests, so expiry needs no job.
 *  - With ISLEME, U's rights on H's requests are U's own rights in U's session hotel (orders.ts).
 *  - One active (or planned) row per user + hotel: a second grant replaces the first.
 */

type Db = Prisma.TransactionClient;

export type CoverageMode = RoomServiceCoverageMode;

/**
 * Screen of the "Oteller Arası Oda Servisi" window in the Yetki Matrisi: V opens the window and lists the grants,
 * O gives (or replaces) a grant, D removes one. Always asked for the hotel whose requests are opened up.
 */
export const COVERAGE_SCREEN = "RO-OTA";
type ManageAction = "V" | "O" | "D";

/** Realtime event addressed to the grantee (`userIds`) whenever their coverage changes. */
export const COVERAGE_CHANGED_EVENT = "rs.coverage.changed";

/** How long a grant whose time ran out stays in the manager list. Revoked grants are not listed at all. */
const RECENT_MS = 7 * 24 * 60 * 60_000;
const LIST_LIMIT = 200;
const ACTIVE_SESSION = ["ONLINE", "UYARI"] as const;

/** Rows that work at `now`. */
function activeAt(now: Date): Prisma.RoomServiceCoverageWhereInput {
  return { revokedAt: null, startsAt: { lte: now }, OR: [{ endsAt: null }, { endsAt: { gt: now } }] };
}

/** Rows that work at `now` or will later (not revoked, not ended). */
function openAt(now: Date): Prisma.RoomServiceCoverageWhereInput {
  return { revokedAt: null, OR: [{ endsAt: null }, { endsAt: { gt: now } }] };
}

/** Hotel id -> mode of every grant of `userId` that works at `now`. */
async function activeFor(userId: string, now: Date = new Date(), db: Db = prisma): Promise<Map<string, CoverageMode>> {
  const rows = await db.roomServiceCoverage.findMany({
    where: { userId, ...activeAt(now) },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { hotelId: true, mode: true },
  });
  // One open row per user + hotel is the invariant (grant); should two exist, the newest decides.
  return new Map(rows.map((r) => [r.hotelId, r.mode]));
}

/** Mode of the grant of `userId` on `hotelId` that works at `now`, if any. */
async function modeFor(
  userId: string,
  hotelId: string,
  now: Date = new Date(),
  db: Db = prisma,
): Promise<CoverageMode | null> {
  const row = await db.roomServiceCoverage.findFirst({
    where: { userId, hotelId, ...activeAt(now) },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { mode: true },
  });
  return row?.mode ?? null;
}

/**
 * The covered hotels of a session: active grants on hotels outside `ctx.hotelIds`. A hotel the session
 * already works in is never "covered": the ordinary rules apply there and a stale grant changes nothing.
 */
async function coveredHotels(ctx: Ctx, now: Date = new Date(), db: Db = prisma): Promise<Map<string, CoverageMode>> {
  const all = await activeFor(ctx.user.id, now, db);
  for (const hotelId of ctx.hotelIds) all.delete(hotelId);
  return all;
}

export type CoverageWindow = { hotelId: string; mode: CoverageMode; startsAt: number; endsAt: number | null };

/**
 * Open (active or planned) grants of a user as plain time windows, for the SSE scope: the stream keeps them in
 * memory and compares them with the clock on every event (`matchesScope`), so an expiry needs no reload.
 */
async function windowsFor(userId: string, now: Date = new Date(), db: Db = prisma): Promise<CoverageWindow[]> {
  const rows = await db.roomServiceCoverage.findMany({
    where: { userId, ...openAt(now) },
    select: { hotelId: true, mode: true, startsAt: true, endsAt: true },
  });
  return rows.map((r) => ({
    hotelId: r.hotelId,
    mode: r.mode,
    startsAt: r.startsAt.getTime(),
    endsAt: r.endsAt ? r.endsAt.getTime() : null,
  }));
}

/**
 * Active users with an ISLEME grant on `hotelId` at `now` who are signed in (ONLINE/UYARI session anywhere):
 * they are told about a new room-service request of that hotel.
 */
async function onlineProcessors(tx: Db, hotelId: string, now: Date = new Date()): Promise<string[]> {
  const rows = await tx.roomServiceCoverage.findMany({
    where: {
      hotelId,
      mode: "ISLEME",
      ...activeAt(now),
      user: { isActive: true, deletedAt: null, sessions: { some: { status: { in: [...ACTIVE_SESSION] } } } },
    },
    select: { userId: true },
  });
  return [...new Set(rows.map((r) => r.userId))];
}

/* ------------------------------------------------------------------------------------------------------------ */
/* Management: grant, revoke, list                                                                              */
/* ------------------------------------------------------------------------------------------------------------ */

/** May the caller do `action` on the coverage of `hotelId`? Own hotel scope and the matrix permission there. */
async function managesHotel(ctx: Ctx, hotelId: string, action: ManageAction): Promise<boolean> {
  if (!ctx.hotelIds.includes(hotelId)) return false;
  return can(ctx, COVERAGE_SCREEN, action, hotelId);
}

async function assertManager(ctx: Ctx, hotelId: string, action: ManageAction): Promise<void> {
  if (!ctx.hotelIds.includes(hotelId)) {
    try {
      // Against the session hotel: the supplied hotel id may be outside the caller's scope or garbage.
      await audit(prisma, {
        userId: ctx.user.id,
        hotelId: ctx.session.hotelId,
        action: "YETKISIZ_DENEME",
        entity: "RoomServiceCoverage",
        after: { hotelId },
      });
    } catch (error) {
      console.error("coverage: YETKISIZ_DENEME denetim kaydı yazılamadı", error);
    }
    throw new DomainError("FORBIDDEN", "Bu otel için oteller arası oda servisi izni veremezsiniz");
  }
  await assertCan(ctx, COVERAGE_SCREEN, action, hotelId);
}

const GRANTEE_SELECT = {
  id: true,
  username: true,
  fullName: true,
  isActive: true,
  deletedAt: true,
  hotelId: true,
  role: { select: { code: true, kind: true, name: true } },
  userHotels: { select: { hotelId: true } },
} as const satisfies Prisma.UserSelect;

type Grantee = Prisma.UserGetPayload<{ select: typeof GRANTEE_SELECT }>;

/** Non-SISTEM grantors reach only the roles below them (roleRanks.ts). */
function assertReachable(ctx: Ctx, grantee: Grantee): void {
  if (!mayManageRole({ roleKind: ctx.user.roleKind, roleCode: ctx.user.roleCode }, grantee.role)) {
    throw new DomainError("FORBIDDEN", "Bu kullanıcıya izin verme yetkiniz yok");
  }
}

function ownHotelIds(user: Pick<Grantee, "hotelId" | "userHotels">): Set<string> {
  const ids = new Set(user.userHotels.map((h) => h.hotelId));
  if (user.hotelId) ids.add(user.hotelId);
  return ids;
}

const grantSchema = z.object({
  userId: z.string().min(1),
  hotelId: z.string().min(1),
  mode: z.enum(["IZLEME", "ISLEME"]),
  /** Default: now. */
  startsAt: z.coerce.date().optional(),
  /** null / missing: until revoked. */
  endsAt: z.coerce.date().nullable().optional(),
  note: z.string().trim().max(200, "Not en fazla 200 karakter olabilir").optional(),
});

const revokeSchema = z.object({ id: z.string().min(1) });

function parse<T>(schema: z.ZodType<T>, raw: unknown): T {
  const result = schema.safeParse(raw);
  if (!result.success) throw fromZod(result.error);
  return result.data;
}

export type CoverageState = "AKTIF" | "PLANLI" | "BITTI" | "KALDIRILDI";

export type CoverageRow = {
  id: string;
  user: { id: string; fullName: string; username: string; roleName: string };
  hotel: { id: string; name: string };
  mode: CoverageMode;
  startsAt: Date;
  endsAt: Date | null;
  revokedAt: Date | null;
  grantedByName: string;
  revokedByName: string | null;
  note: string | null;
  state: CoverageState;
};

const ROW_INCLUDE = {
  user: { select: { id: true, fullName: true, username: true, role: { select: { name: true } } } },
  hotel: { select: { id: true, name: true } },
  grantedBy: { select: { fullName: true } },
  revokedBy: { select: { fullName: true } },
} as const satisfies Prisma.RoomServiceCoverageInclude;

type RowWithRefs = Prisma.RoomServiceCoverageGetPayload<{ include: typeof ROW_INCLUDE }>;

export function coverageState(
  row: { startsAt: Date; endsAt: Date | null; revokedAt: Date | null },
  now: Date,
): CoverageState {
  if (row.revokedAt) return "KALDIRILDI";
  if (row.endsAt && row.endsAt.getTime() <= now.getTime()) return "BITTI";
  return row.startsAt.getTime() > now.getTime() ? "PLANLI" : "AKTIF";
}

function toRow(row: RowWithRefs, now: Date): CoverageRow {
  return {
    id: row.id,
    user: { id: row.user.id, fullName: row.user.fullName, username: row.user.username, roleName: row.user.role.name },
    hotel: row.hotel,
    mode: row.mode,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    revokedAt: row.revokedAt,
    grantedByName: row.grantedBy.fullName,
    revokedByName: row.revokedBy?.fullName ?? null,
    note: row.note,
    state: coverageState(row, now),
  };
}

function auditShape(row: { userId: string; hotelId: string; mode: CoverageMode; startsAt: Date; endsAt: Date | null; note: string | null }) {
  return {
    granteeId: row.userId,
    hotelId: row.hotelId,
    mode: row.mode,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt ? row.endsAt.toISOString() : null,
    note: row.note,
  };
}

/**
 * Gives (or, when the user already has an open grant on that hotel, replaces) a coverage grant. The grantor
 * must manage the hotel (own scope, RO-OTA create there) and, unless a SISTEM role, rank above the
 * grantee's role. The grantee must be active and must not already work in the hotel.
 */
async function grant(ctx: Ctx, raw: unknown): Promise<CoverageRow> {
  const input = parse(grantSchema, raw);
  await assertManager(ctx, input.hotelId, "O");

  const now = new Date();
  const startsAt = input.startsAt ?? now;
  const endsAt = input.endsAt ?? null;
  if (endsAt && (endsAt.getTime() <= startsAt.getTime() || endsAt.getTime() <= now.getTime())) {
    const message = "Bitiş zamanı başlangıçtan ve şu andan sonra olmalı";
    throw new DomainError("VALIDATION", message, { fieldErrors: { endsAt: [message] } });
  }

  const grantee = await prisma.user.findUnique({ where: { id: input.userId }, select: GRANTEE_SELECT });
  if (!grantee || grantee.deletedAt) throw new DomainError("NOT_FOUND", "Kullanıcı bulunamadı");
  assertReachable(ctx, grantee);
  if (!grantee.isActive) {
    const message = "Pasif kullanıcıya izin verilemez";
    throw new DomainError("VALIDATION", message, { fieldErrors: { userId: [message] } });
  }
  if (grantee.role.kind === "SISTEM" || ownHotelIds(grantee).has(input.hotelId)) {
    const message = "Kullanıcı zaten bu otelde çalışıyor; ayrıca izin gerekmez";
    throw new DomainError("VALIDATION", message, { fieldErrors: { hotelId: [message] } });
  }
  const hotel = await prisma.hotel.findUnique({ where: { id: input.hotelId }, select: { isActive: true } });
  if (!hotel?.isActive) throw new DomainError("NOT_FOUND", "Otel bulunamadı");

  return prisma.$transaction(async (tx) => {
    // Serialises concurrent grants for the same user + hotel: one open row is the invariant.
    const lockKey = `rs-coverage:${input.userId}:${input.hotelId}`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;

    const open = await tx.roomServiceCoverage.findMany({
      where: { userId: input.userId, hotelId: input.hotelId, ...openAt(now) },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
    const [current, ...extra] = open;
    if (extra.length > 0) {
      await tx.roomServiceCoverage.updateMany({
        where: { id: { in: extra.map((r) => r.id) } },
        data: { revokedAt: now, revokedById: ctx.user.id },
      });
    }

    const data = { mode: input.mode, startsAt, endsAt, note: input.note || null, grantedById: ctx.user.id };
    const saved = current
      ? await tx.roomServiceCoverage.update({ where: { id: current.id }, data, include: ROW_INCLUDE })
      : await tx.roomServiceCoverage.create({
          data: { userId: input.userId, hotelId: input.hotelId, ...data },
          include: ROW_INCLUDE,
        });

    await audit(tx, {
      userId: ctx.user.id,
      hotelId: input.hotelId,
      action: current ? "RS_COVERAGE_CHANGED" : "RS_COVERAGE_GRANTED",
      entity: "RoomServiceCoverage",
      entityId: saved.id,
      ...(current ? { before: auditShape(current) } : {}),
      after: { ...auditShape(saved), granteeName: grantee.fullName, grantedById: ctx.user.id },
    });
    await publish(
      { type: COVERAGE_CHANGED_EVENT, userIds: [input.userId], payload: { hotelId: input.hotelId, mode: input.mode } },
      tx,
    );
    return toRow(saved, now);
  });
}

/** Ends a grant now. Same authority as granting it. Revoking an ended or revoked grant is a CONFLICT. */
async function revoke(ctx: Ctx, raw: unknown): Promise<CoverageRow> {
  const input = parse(revokeSchema, raw);
  const found = await prisma.roomServiceCoverage.findUnique({
    where: { id: input.id },
    select: { hotelId: true, user: { select: GRANTEE_SELECT } },
  });
  // A grant of a hotel outside the caller's scope does not exist for them.
  if (!found || !ctx.hotelIds.includes(found.hotelId)) throw new DomainError("NOT_FOUND", "İzin bulunamadı");
  await assertManager(ctx, found.hotelId, "D");
  assertReachable(ctx, found.user);

  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM room_service_coverages WHERE id = ${input.id} FOR UPDATE`;
    if (rows.length === 0) throw new DomainError("NOT_FOUND", "İzin bulunamadı");
    const now = new Date();
    const row = await tx.roomServiceCoverage.findUniqueOrThrow({ where: { id: input.id } });
    if (row.revokedAt || (row.endsAt && row.endsAt.getTime() <= now.getTime())) {
      throw new DomainError("CONFLICT", "İzin zaten sona ermiş");
    }
    const saved = await tx.roomServiceCoverage.update({
      where: { id: row.id },
      data: { revokedAt: now, revokedById: ctx.user.id },
      include: ROW_INCLUDE,
    });
    await audit(tx, {
      userId: ctx.user.id,
      hotelId: row.hotelId,
      action: "RS_COVERAGE_REVOKED",
      entity: "RoomServiceCoverage",
      entityId: row.id,
      before: auditShape(row),
      after: { ...auditShape(row), granteeName: saved.user.fullName, revokedAt: now.toISOString(), revokedById: ctx.user.id },
    });
    await publish(
      { type: COVERAGE_CHANGED_EVENT, userIds: [row.userId], payload: { hotelId: row.hotelId, mode: null } },
      tx,
    );
    return toRow(saved, now);
  });
}

async function managedHotels(ctx: Ctx): Promise<CoverageOverview["hotels"]> {
  const hotels = await prisma.hotel.findMany({
    where: { id: { in: ctx.hotelIds }, isActive: true },
    select: { id: true, name: true, code: true },
    orderBy: { name: "asc" },
  });
  const out = [];
  for (const hotel of hotels) {
    if (!(await managesHotel(ctx, hotel.id, "V"))) continue;
    out.push({
      ...hotel,
      canGrant: await managesHotel(ctx, hotel.id, "O"),
      canRevoke: await managesHotel(ctx, hotel.id, "D"),
    });
  }
  return out;
}

export type CoverageCandidate = {
  id: string;
  fullName: string;
  username: string;
  roleName: string;
  /** Hotels the user already works in: never offered as a target. */
  hotelIds: string[];
};

export type CoverageOverview = {
  /** Hotels whose coverage the caller sees; `canGrant` / `canRevoke` say what else the matrix lets them do there. */
  hotels: { id: string; name: string; code: string; canGrant: boolean; canRevoke: boolean }[];
  /** Open grants first (newest first), then the ones whose time ran out in the last week. Never a revoked one. */
  rows: CoverageRow[];
  /** Users the caller may grant to: active, a role below the caller, a role that has the room-service board. */
  candidates: CoverageCandidate[];
  serverNow: string;
};

/** The manager window: managed hotels, their open and recent grants, and who may be granted. */
async function list(ctx: Ctx): Promise<CoverageOverview> {
  const hotels = await managedHotels(ctx);
  if (hotels.length === 0) throw new DomainError("FORBIDDEN", "Bu işlem için yetkiniz yok");
  const now = new Date();
  const hotelIds = hotels.map((h) => h.id);
  const grantHotelIds = hotels.filter((h) => h.canGrant).map((h) => h.id);

  const [rows, users] = await Promise.all([
    prisma.roomServiceCoverage.findMany({
      where: {
        hotelId: { in: hotelIds },
        // A grant removed by hand leaves the window at once; the audit log keeps it.
        revokedAt: null,
        OR: [{ endsAt: null }, { endsAt: { gt: new Date(now.getTime() - RECENT_MS) } }],
      },
      include: ROW_INCLUDE,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: LIST_LIMIT,
    }),
    prisma.user.findMany({
      where: {
        isActive: true,
        deletedAt: null,
        role: {
          kind: { not: "SISTEM" },
          // Only roles that can open the room-service board at all: a grant to anyone else would do nothing.
          screenPermissions: { some: { canView: true, screen: { code: "RO-TAL" } } },
        },
      },
      select: GRANTEE_SELECT,
      orderBy: [{ fullName: "asc" }, { id: "asc" }],
    }),
  ]);

  const actor = { roleKind: ctx.user.roleKind, roleCode: ctx.user.roleCode };
  const candidates = users
    .filter((u) => u.id !== ctx.user.id && mayManageRole(actor, u.role))
    .map((u) => ({
      id: u.id,
      fullName: u.fullName,
      username: u.username,
      roleName: u.role.name,
      hotelIds: [...ownHotelIds(u)],
    }))
    // Someone who already works in every hotel the caller may grant has nothing to be granted.
    .filter((u) => grantHotelIds.some((id) => !u.hotelIds.includes(id)));

  const mapped = rows.map((r) => toRow(r, now));
  const open = (r: CoverageRow) => r.state === "AKTIF" || r.state === "PLANLI";
  return {
    hotels,
    rows: [...mapped.filter(open), ...mapped.filter((r) => !open(r))],
    candidates,
    serverNow: now.toISOString(),
  };
}

export const coverage = {
  grant,
  revoke,
  list,
  activeFor,
  modeFor,
  coveredHotels,
  windowsFor,
  onlineProcessors,
};
