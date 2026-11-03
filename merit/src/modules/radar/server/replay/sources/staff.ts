// Replay source "staff" (PERSONEL layer): session logins/logouts, warnings, the idle marker kept in OperationEvent and
// failed mails (SISTEM sessions only). IP, user agent and device label are never selected, and sessions of the SISTEM
// role stay invisible to everybody but SISTEM.
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import type { RadarEvent } from "../../../types";
import { mergeSources } from "../merge";
import { hasLayer, iso, pagedEvents, timeFilter, type ReplaySource, type ReplaySourceArgs } from "./paging";

function sessionScope(q: ReplaySourceArgs): Prisma.UserSessionWhereInput {
  const isSystem = q.ctx.user.roleKind === "SISTEM";
  return {
    hotelId: q.hotelId,
    ...(isSystem ? {} : { role: { kind: { not: "SISTEM" } }, user: { role: { kind: { not: "SISTEM" } } } }),
  };
}

async function* logins(q: ReplaySourceArgs): AsyncGenerator<RadarEvent> {
  yield* pagedEvents(
    q,
    async (range, take) => {
      const rows = await prisma.userSession.findMany({
        where: { ...sessionScope(q), loginAt: timeFilter(range) },
        select: { id: true, userId: true, outletId: true, loginAt: true },
        orderBy: [{ loginAt: "asc" }, { id: "asc" }],
        ...(take ? { take } : {}),
      });
      return rows.map((r) => ({ ...r, at: r.loginAt }));
    },
    (s) => [
      {
        id: `user_sessions:${s.id}:login`,
        at: iso(s.at),
        hotelId: q.hotelId,
        layer: "PERSONEL",
        ...(s.outletId ? { outletId: s.outletId } : {}),
        type: "presence",
        sessionId: s.id,
        userId: s.userId,
        status: "ONLINE",
        ...(s.outletId ? { outletId: s.outletId } : {}),
      },
    ],
  );
}

async function* logouts(q: ReplaySourceArgs): AsyncGenerator<RadarEvent> {
  yield* pagedEvents(
    q,
    async (range, take) => {
      const rows = await prisma.userSession.findMany({
        where: { ...sessionScope(q), logoutAt: timeFilter(range) },
        select: { id: true, userId: true, outletId: true, status: true, logoutAt: true },
        orderBy: [{ logoutAt: "asc" }, { id: "asc" }],
        ...(take ? { take } : {}),
      });
      return rows.flatMap((r) => (r.logoutAt ? [{ ...r, at: r.logoutAt }] : []));
    },
    (s) => [
      {
        id: `user_sessions:${s.id}:logout`,
        at: iso(s.at),
        hotelId: q.hotelId,
        layer: "PERSONEL",
        ...(s.outletId ? { outletId: s.outletId } : {}),
        type: "presence",
        sessionId: s.id,
        userId: s.userId,
        status: s.status === "DUSURULDU" ? "DUSURULDU" : "CIKTI",
      },
    ],
  );
}

async function* warnings(q: ReplaySourceArgs): AsyncGenerator<RadarEvent> {
  yield* pagedEvents(
    q,
    async (range, take) => {
      const rows = await prisma.sessionEvent.findMany({
        where: { event: "WARN", createdAt: timeFilter(range), session: sessionScope(q) },
        select: { id: true, createdAt: true, session: { select: { id: true, userId: true, outletId: true } } },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        ...(take ? { take } : {}),
      });
      return rows.map((r) => ({ ...r, at: r.createdAt }));
    },
    (e) => [
      {
        id: `session_events:${e.id}:warn`,
        at: iso(e.at),
        hotelId: q.hotelId,
        layer: "PERSONEL",
        ...(e.session.outletId ? { outletId: e.session.outletId } : {}),
        type: "presence",
        sessionId: e.session.id,
        userId: e.session.userId,
        status: "UYARI",
      },
    ],
  );
}

async function* idle(q: ReplaySourceArgs): AsyncGenerator<RadarEvent> {
  yield* pagedEvents(
    q,
    async (range, take) => {
      const ops = await prisma.operationEvent.findMany({
        where: { hotelId: q.hotelId, type: "presence.idle", at: timeFilter(range) },
        select: { id: true, at: true, refId: true },
        orderBy: [{ at: "asc" }, { id: "asc" }],
        ...(take ? { take } : {}),
      });
      const ids = ops.flatMap((o) => (o.refId ? [o.refId] : []));
      // Only sessions the caller may see; the lookup doubles as the SISTEM-role filter.
      const sessions = ids.length
        ? await prisma.userSession.findMany({
            where: { ...sessionScope(q), id: { in: ids } },
            select: { id: true, userId: true, outletId: true },
          })
        : [];
      const byId = new Map(sessions.map((s) => [s.id, s]));
      // Keep every raw row for paging; eligibility only controls emitted events.
      return ops.map((o) => ({ ...o, session: o.refId ? byId.get(o.refId) : undefined }));
    },
    (o) => o.session ? [
      {
        id: `operation_events:${o.id}:presence.idle`,
        at: iso(o.at),
        hotelId: q.hotelId,
        layer: "PERSONEL",
        ...(o.session.outletId ? { outletId: o.session.outletId } : {}),
        type: "presence",
        sessionId: o.session.id,
        userId: o.session.userId,
        status: "BOSTA",
      },
    ] : [],
  );
}

async function* mailFailures(q: ReplaySourceArgs): AsyncGenerator<RadarEvent> {
  yield* pagedEvents(
    q,
    async (range, take) => {
      const rows = await prisma.emailLog.findMany({
        where: { status: "HATA", updatedAt: timeFilter(range) },
        select: { id: true, kind: true, updatedAt: true },
        orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
        ...(take ? { take } : {}),
      });
      return rows.map((r) => ({ ...r, at: r.updatedAt }));
    },
    (m) => [
      {
        id: `email_logs:${m.id}:failed`,
        at: iso(m.at),
        hotelId: q.hotelId,
        layer: "SISTEM",
        type: "mail.failed",
        kind: m.kind.slice(0, 32),
      },
    ],
  );
}

export const staffSource: ReplaySource = (q) => {
  const parts: AsyncIterable<RadarEvent>[] = [];
  if (hasLayer(q, "PERSONEL")) parts.push(logins(q), logouts(q), warnings(q), idle(q));
  // The mail log carries no hotel; the failures are complex-wide and SISTEM-only, like the snapshot counter.
  if (q.ctx.user.roleKind === "SISTEM") parts.push(mailFailures(q));
  return mergeSources(parts);
};
