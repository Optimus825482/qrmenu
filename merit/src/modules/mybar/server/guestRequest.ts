import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { createRateLimiter, scaledMax } from "@/lib/rate-limit";
import { DomainError, fromZod } from "@/lib/result";
import { LOCALES, type Locale } from "@/lib/i18n/locales";
import { getSetting } from "@/lib/settings";
import { businessDate, businessDay } from "@/lib/time";
import { audit } from "@/modules/core/server/audit";
import { type GuestMeta, resolveGuestTokenLimited } from "@/modules/menu/server/guestToken";
import { MYBAR_NOTE_MAX, MYBAR_QTY_CAP, MYBAR_SUBMIT_LIMIT } from "../constants";
import { publishMybar } from "../events";
import { catalogProductIds, catalogQuantityMode } from "./catalog";
import { notifyNewRequest } from "./fanout";
import { getRoomGuestState, ROOM_CLOSED_MESSAGES } from "./roomGuest";
import { sanitizeNote } from "./sanitize";
import { localizeTexts, translateNoteForStaff } from "./translateService";

/** Submissions per IP (scaled by `guest.ipRateMultiplier` for hotel NATs) and per room. */
export const ipLimiter = createRateLimiter({
  max: () => scaledMax(MYBAR_SUBMIT_LIMIT.max),
  windowMs: MYBAR_SUBMIT_LIMIT.windowMs,
});
/** Oda başına sınır NAT çarpanından etkilenmez (plan). */
export const roomLimiter = createRateLimiter({
  max: () => MYBAR_SUBMIT_LIMIT.max * 2,
  windowMs: MYBAR_SUBMIT_LIMIT.windowMs,
});
/** Status polling: 60 per minute per IP (scaled). */
export const statusLimiter = createRateLimiter({ max: () => scaledMax(60), windowMs: 60_000 });

export const mybarSubmitSchema = z.object({
  idempotencyKey: z.uuid(),
  locale: z.enum(LOCALES),
  items: z.array(z.object({ productId: z.string().min(1).max(64), qty: z.int().min(1).max(MYBAR_QTY_CAP) })).max(100),
  note: z.string().max(2000).optional(),
});

export type GuestRequestView = { requestId: string; duplicate: boolean; createdAt: string };
export type GuestRequestStatus = "BEKLIYOR" | "GORULDU" | "KARSILANDI" | "KISMEN" | "IPTAL";
export type GuestRequestStatusView = {
  request: null | {
    requestId: string;
    status: GuestRequestStatus;
    createdAt: string;
    items: { name: string; qty: number }[];
  };
};

const RATE_MESSAGE = "Çok fazla deneme, biraz sonra tekrar deneyin";
const EMPTY_MESSAGE = "En az bir ürün seçmeli veya not eklemelisiniz.";
const NOTE_MESSAGE = "Not en fazla 500 karakter olabilir";

const isUniqueViolation = (e: unknown) => (e as { code?: string } | null)?.code === "P2002";

type RoomRef = { roomId: string; hotelId: string };

/** Hotel and room come from the QR token only; the failed lookup is logged (the page-view path logs its own scans). */
async function resolveRoom(token: string, meta: GuestMeta): Promise<RoomRef> {
  const target = await resolveGuestTokenLimited(token, meta, undefined, undefined, { log: false });
  if (target.kind === "ROOM") return { roomId: target.roomId, hotelId: target.hotelId };
  if (target.kind === "NONE") {
    if (target.reason === "RATE_LIMITED") throw new DomainError("RATE_LIMITED", RATE_MESSAGE);
    if (target.reason === "OTEL_PASIF") throw new DomainError("CONFLICT", ROOM_CLOSED_MESSAGES.OTEL_PASIF);
    if (target.reason === "BILINMEYEN") {
      try {
        await prisma.qrScanLog.create({
          data: { kind: "MISAFIR", ip: meta.ip, userAgent: meta.userAgent.slice(0, 255), ok: false, error: "BILINMEYEN" },
        });
      } catch (error) {
        console.error("[mybar] scan log", error);
      }
    }
  }
  throw new DomainError("NOT_FOUND", "Geçersiz QR kod");
}

const STALE_KEY_MESSAGE = "Bu istek anahtarı önceki bir güne ait";

type PriorRequest = { id: string; roomId: string; createdAt: Date; businessDate: Date };

/** A key replays only within the business day it was used; an older one is refused so the client issues a fresh key. */
function replayView(prior: PriorRequest, roomId: string): GuestRequestView {
  if (prior.roomId !== roomId) throw new DomainError("CONFLICT", "Bu istek anahtarı başka bir odaya ait");
  if (prior.businessDate.getTime() !== businessDay(businessDate()).getTime()) {
    throw new DomainError("VALIDATION", STALE_KEY_MESSAGE, { fieldErrors: { idempotencyKey: [STALE_KEY_MESSAGE] } });
  }
  return { requestId: prior.id, duplicate: true, createdAt: prior.createdAt.toISOString() };
}

async function replayOf(idempotencyKey: string, roomId: string): Promise<GuestRequestView | null> {
  const prior = await prisma.mybarRequest.findUnique({
    where: { idempotencyKey },
    select: { id: true, roomId: true, createdAt: true, businessDate: true },
  });
  return prior ? replayView(prior, roomId) : null;
}

export async function createGuestRequest(
  input: z.infer<typeof mybarSubmitSchema> & { token: string; ip: string; userAgent: string },
): Promise<GuestRequestView> {
  // (1) per-IP limit first: cheap and it also covers token probing.
  if (!(await ipLimiter.hit(input.ip)).allowed) throw new DomainError("RATE_LIMITED", RATE_MESSAGE);

  // (2) shape
  const parsed = mybarSubmitSchema.safeParse(input);
  if (!parsed.success) throw fromZod(parsed.error);
  const data = parsed.data;

  // (3) token -> room (hotel never from the body)
  const meta: GuestMeta = { ip: input.ip, userAgent: input.userAgent };
  const { roomId, hotelId } = await resolveRoom(String(input.token).slice(0, 64), meta);
  if (!(await roomLimiter.hit(roomId)).allowed) throw new DomainError("RATE_LIMITED", RATE_MESSAGE);

  // (4) room must be open for MyBar
  const state = await getRoomGuestState(roomId);
  if (!state.mybarOpen) {
    throw new DomainError("CONFLICT", ROOM_CLOSED_MESSAGES[state.reason ?? "MYBAR_KAPALI"]);
  }

  // (5) idempotent replay: no side effects
  const replay = await replayOf(data.idempotencyKey, roomId);
  if (replay) return replay;

  // (6) note
  const note = data.note ? sanitizeNote(data.note) : "";
  if (note.length > MYBAR_NOTE_MAX) {
    throw new DomainError("VALIDATION", NOTE_MESSAGE, { fieldErrors: { note: [NOTE_MESSAGE] } });
  }
  // (7) something to send
  if (data.items.length === 0 && !note) throw new DomainError("VALIDATION", EMPTY_MESSAGE);

  // (8) the network call stays outside the transaction (and outside the room lock)
  const translated = note ? await translateNoteForStaff(hotelId, note) : { noteTr: null, srcLang: null };

  try {
    return await prisma.$transaction(async (tx) => {
      // (9) serialise per room: two concurrent requests -> one wins, the other gets DAILY_LIMIT
      await tx.$queryRaw`SELECT id FROM rooms WHERE id = ${roomId} FOR UPDATE`;

      const raced = await tx.mybarRequest.findUnique({
        where: { idempotencyKey: data.idempotencyKey },
        select: { id: true, roomId: true, createdAt: true, businessDate: true },
      });
      if (raced) return replayView(raced, roomId);

      const today = businessDay(businessDate());
      if (await getSetting("mybar.dailyLimit", hotelId)) {
        const used = await tx.mybarRequest.count({ where: { roomId, businessDate: today, status: { not: "IPTAL" } } });
        if (used >= (await getSetting("mybar.dailyMax", hotelId))) throw new DomainError("DAILY_LIMIT", "Bugün bu odadan talep gönderildi");
      }

      const catalog = await catalogProductIds(roomId, tx);
      const quantityMode = await catalogQuantityMode(roomId, tx);
      const seen = new Set<string>();
      const bad: string[] = [];
      for (const item of data.items) {
        const known = catalog.get(item.productId);
        const qty = quantityMode === "TICK" ? 1 : item.qty; // a tick box can only mean one
        if (!known || qty > known.maxQty || seen.has(item.productId)) bad.push(item.productId);
        seen.add(item.productId);
      }
      if (bad.length > 0) {
        const named = await tx.product.findMany({ where: { id: { in: bad } }, select: { id: true, name: true } });
        const nameOf = new Map(named.map((p) => [p.id, p.name]));
        const names = [...new Set(bad.map((id) => nameOf.get(id) ?? "Bilinmeyen ürün"))];
        throw new DomainError("VALIDATION", "Seçtiğiniz ürünlerden bazıları artık sunulmuyor veya adet sınırını aşıyor", {
          fieldErrors: { items: names },
        });
      }
      const lines = data.items.map((i) => ({ productId: i.productId, qty: quantityMode === "TICK" ? 1 : i.qty }));

      const created = await tx.mybarRequest.create({
        data: {
          hotelId,
          roomId,
          businessDate: today,
          status: "BEKLEMEDE",
          language: data.locale,
          note: note || null,
          noteTr: translated.noteTr,
          noteSrcLang: translated.srcLang ? translated.srcLang.slice(0, 8) : null,
          idempotencyKey: data.idempotencyKey,
          clientIp: input.ip,
          items: { create: lines.map((l) => ({ productId: l.productId, requestedQty: l.qty })) },
        },
        select: { id: true, createdAt: true },
      });

      await audit(tx, {
        hotelId,
        action: "MYBAR_CREATE",
        entity: "MybarRequest",
        entityId: created.id,
        after: { roomId, items: lines.length, locale: data.locale },
        ip: input.ip,
      });
      await notifyNewRequest(tx, {
        id: created.id,
        hotelId,
        roomNumber: state.roomNumber,
        floorName: state.floorName,
        items: lines.map((l) => ({ name: catalog.get(l.productId)?.name ?? "", qty: l.qty })),
        noteTr: translated.noteTr,
        note: note || null,
      });
      await publishMybar(tx, "mybar.created", {
        id: created.id,
        hotelId,
        roomId,
        roomNumber: state.roomNumber,
        status: "BEKLEMEDE",
      });
      return { requestId: created.id, duplicate: false, createdAt: created.createdAt.toISOString() };
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      const winner = await replayOf(data.idempotencyKey, roomId);
      if (winner) return winner;
    }
    throw error;
  }
}

/** "KISMEN": staff closed the request with some products missing; the guest must not read it as fully served. */
const GUEST_STATUS = (r: { status: string; seenAt: Date | null; closedWithMissing: boolean }): GuestRequestStatus =>
  r.status === "TAMAMLANDI"
    ? r.closedWithMissing ? "KISMEN" : "KARSILANDI"
    : r.status === "IPTAL" ? "IPTAL" : r.seenAt ? "GORULDU" : "BEKLIYOR";

/**
 * The room's most recent request of today, or a still-pending one from an earlier day (it must not vanish at
 * midnight), as the guest may see it: no staff names, notes, prices or internals.
 */
export async function roomRequestStatus(roomId: string, locale: Locale): Promise<GuestRequestStatusView> {
  const row = await prisma.mybarRequest.findFirst({
    where: { roomId, OR: [{ businessDate: businessDay(businessDate()) }, { status: "BEKLEMEDE" }] },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: {
      id: true,
      status: true,
      seenAt: true,
      closedWithMissing: true,
      createdAt: true,
      items: { select: { requestedQty: true, product: { select: { name: true } } }, orderBy: { createdAt: "asc" } },
    },
  });
  if (!row) return { request: null };
  const names = await localizeTexts(row.items.map((i) => i.product.name), locale);
  return {
    request: {
      requestId: row.id,
      status: GUEST_STATUS(row),
      createdAt: row.createdAt.toISOString(),
      items: row.items.map((i) => ({ name: names.get(i.product.name) ?? i.product.name, qty: i.requestedQty })),
    },
  };
}

export async function guestRequestStatus(input: {
  token: string;
  locale: Locale;
  ip: string;
  userAgent: string;
}): Promise<GuestRequestStatusView> {
  if (!(await statusLimiter.hit(input.ip)).allowed) throw new DomainError("RATE_LIMITED", RATE_MESSAGE);
  const { roomId } = await resolveRoom(String(input.token).slice(0, 64), { ip: input.ip, userAgent: input.userAgent });
  return roomRequestStatus(roomId, input.locale);
}
