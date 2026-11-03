import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { createRateLimiter } from "@/lib/rate-limit";
import { publish } from "@/lib/realtime";
import { DomainError, fromZod } from "@/lib/result";
import { getSetting, getSettings } from "@/lib/settings";
import { businessDate, businessDay } from "@/lib/time";
import { audit } from "@/modules/core/server/audit";
import { type GuestMeta, resolveGuestTokenLimited } from "@/modules/menu/server/guestToken";
import { normalizeGeminiModel } from "@/modules/menu/server/translations";
import { lockRow, roomCatalogue } from "./minibarCommon";
import { takeManyFromPool } from "./pool";

export interface MybarProductOption {
  id: string;
  name: string;
  unit: string;
  groupName: string;
  /** Largest quantity the guest may ask for (mybar.maxQtyPerItem; "setup" = the room's setup quantity). */
  maxQty: number;
}

/** Guest MyBar submissions: 10 per minute per IP. */
export const mybarCreateLimiter = createRateLimiter({ max: 10, windowMs: 60_000 });
/** Guest MyBar page loads: 60 per minute per IP. */
export const mybarReadLimiter = createRateLimiter({ max: 60, windowMs: 60_000 });

const LOCALES = ["tr", "en", "de", "ru", "ar", "fr", "el", "it"] as const;
const FALLBACK_MAX_QTY = 5;

function sanitize(text: string): string {
  return text
    .replace(/<[^>]*>/g, "")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .trim();
}

/**
 * Translates guest note in any language (EN, RU, DE, AR, etc.) into Turkish using Gemini.
 * The API key travels in a header, never in the URL.
 */
export async function translateNoteToTurkish(text: string): Promise<string> {
  const trimmed = text.trim();
  if (!trimmed) return "";

  try {
    const apiKey = await getSetting("translation.geminiKey");
    const model = await getSetting("translation.geminiModel");

    if (!apiKey) {
      return trimmed;
    }

    const activeModel = normalizeGeminiModel(model);
    const prompt = `You are a professional luxury hotel guest relations assistant.
Translate the following hotel guest minibar request note into natural, polite Turkish.
If the note is already in Turkish, keep it as is.
Return ONLY the translated Turkish sentence (no explanations, no quotation marks, no markdown).

Guest note:
"${trimmed}"`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${activeModel}:generateContent`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 300,
        },
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      console.warn("Gemini note translation failed, falling back to original:", response.status);
      return trimmed;
    }

    const payload = await response.json();
    const candidate = payload?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
    return trimmed;
  } catch (err) {
    console.warn("Translation error, using original note:", err);
    return trimmed;
  }
}

/** The room a QR token points at; the hotel and room never come from the request body. */
async function resolveRoomToken(token: string, meta: GuestMeta) {
  const target = await resolveGuestTokenLimited(token, meta, undefined, undefined, { log: false });
  if (target.kind === "ROOM") return { roomId: target.roomId, hotelId: target.hotelId };
  if (target.kind === "NONE" && target.reason === "RATE_LIMITED") {
    throw new DomainError("RATE_LIMITED", "Çok fazla deneme, biraz sonra tekrar deneyin");
  }
  throw new DomainError("NOT_FOUND", "Oda bulunamadı.");
}

async function maxQtyFor(hotelId: string, cap: number): Promise<number> {
  const setting = await getSetting("mybar.maxQtyPerItem", hotelId);
  if (setting === "setup") return Math.max(1, cap);
  return typeof setting === "number" ? setting : FALLBACK_MAX_QTY;
}

/**
 * Loads room info and the products of the room's setup catalogue for a QR token, and whether
 * today's quota is already used.
 */
export async function getMybarRoomDetails(token: string, meta: GuestMeta) {
  if (!mybarReadLimiter.hit(meta.ip).allowed) {
    throw new DomainError("RATE_LIMITED", "Çok fazla istek, biraz sonra tekrar deneyin");
  }
  const { roomId, hotelId } = await resolveRoomToken(token, meta);
  const today = businessDay(businessDate());

  const room = await prisma.room.findFirst({
    where: { id: roomId, hotelId },
    include: {
      hotel: { select: { id: true, name: true, code: true, logoUrl: true } },
      roomType: { select: { id: true, name: true } },
    },
  });
  if (!room) throw new DomainError("NOT_FOUND", "Oda bulunamadı.");

  const existingTodayRequest = await prisma.mybarRequest.findFirst({
    where: { hotelId, roomId: room.id, businessDate: today, status: { not: "IPTAL" } },
    include: { items: { include: { product: { select: { name: true } } } } },
  });

  const cat = await roomCatalogue(prisma, hotelId, room.roomTypeId);
  const products: MybarProductOption[] = [];
  const seen = new Set<string>();
  for (const setup of cat.setups) {
    for (const it of setup.items) {
      if (!it.product.isActive || seen.has(it.product.id)) continue;
      seen.add(it.product.id);
      products.push({
        id: it.product.id,
        name: it.product.name,
        unit: it.product.unit || "Adet",
        groupName: it.product.group?.name || "Minibar",
        maxQty: await maxQtyFor(hotelId, cat.caps.get(it.product.id) ?? FALLBACK_MAX_QTY),
      });
    }
  }

  return {
    hotel: {
      id: room.hotel.id,
      name: room.hotel.name,
      code: room.hotel.code,
      logoUrl: room.hotel.logoUrl,
    },
    room: {
      id: room.id,
      number: room.number,
      roomTypeName: room.roomType?.name || "Standart Oda",
    },
    alreadyRequestedToday: Boolean(existingTodayRequest),
    existingRequest: existingTodayRequest
      ? {
          id: existingTodayRequest.id,
          status: existingTodayRequest.status,
          createdAt: existingTodayRequest.createdAt.toISOString(),
          items: existingTodayRequest.items.map((i) => ({
            productName: i.product.name,
            qty: i.requestedQty,
          })),
        }
      : null,
    products,
  };
}

const createSchema = z.object({
  token: z.string().min(1).max(64),
  idempotencyKey: z.uuid("Geçersiz istek anahtarı"),
  language: z.string().max(8).default("tr"),
  note: z.string().max(500, "En fazla 500 karakter").optional(),
  items: z
    .array(
      z.object({
        productId: z.string().min(1).max(64),
        qty: z.number().int("Adet tam sayı olmalı").min(1, "Adet en az 1").max(20, "Adet en fazla 20"),
      }),
    )
    .min(1, "Lütfen en az bir ürün seçiniz.")
    .max(50),
  ip: z.string().min(1),
  userAgent: z.string().default(""),
});

export type GuestMybarInput = z.input<typeof createSchema>;

const isUniqueViolation = (e: unknown) => (e as { code?: string } | null)?.code === "P2002";

async function replayOf(idempotencyKey: string, roomId: string) {
  const prior = await prisma.mybarRequest.findUnique({
    where: { idempotencyKey },
    include: { room: { select: { number: true } } },
  });
  if (!prior) return null;
  if (prior.roomId !== roomId) {
    throw new DomainError("VALIDATION", "Geçersiz istek anahtarı", {
      fieldErrors: { idempotencyKey: ["Geçersiz istek anahtarı"] },
    });
  }
  return { success: true, requestId: prior.id, roomNumber: prior.room.number, replayed: true };
}

/**
 * Creates a MyBar request from a guest phone. Hotel and room come from the QR token; items are
 * checked against the room's setup catalogue; the daily limit is enforced under a room row lock;
 * the client-supplied idempotency key replays the first result.
 */
export async function createGuestMybarRequest(input: GuestMybarInput) {
  if (!mybarCreateLimiter.hit(input.ip).allowed) {
    throw new DomainError("RATE_LIMITED", "Çok fazla deneme, biraz sonra tekrar deneyin");
  }
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) throw fromZod(parsed.error);
  const data = parsed.data;

  const { roomId, hotelId } = await resolveRoomToken(data.token, { ip: data.ip, userAgent: data.userAgent });
  const replay = await replayOf(data.idempotencyKey, roomId);
  if (replay) return replay;

  const language = (LOCALES as readonly string[]).includes(data.language) ? data.language : "tr";
  const note = data.note ? sanitize(data.note) : "";
  const settings = await getSettings(
    ["mybar.dailyLimit", "mybar.quantityMode", "mybar.translateNotes"],
    hotelId,
  );
  // The network call stays outside the transaction.
  const noteTr = note && settings["mybar.translateNotes"] ? await translateNoteToTurkish(note) : note || null;

  const merged = new Map<string, number>();
  for (const it of data.items) merged.set(it.productId, (merged.get(it.productId) ?? 0) + it.qty);

  try {
    return await prisma.$transaction(async (tx) => {
      await lockRow(tx, "rooms", roomId);
      const room = await tx.room.findFirst({
        where: { id: roomId, hotelId },
        select: { id: true, number: true, roomTypeId: true },
      });
      if (!room) throw new DomainError("NOT_FOUND", "Oda bulunamadı.");

      const again = await tx.mybarRequest.findUnique({
        where: { idempotencyKey: data.idempotencyKey },
        include: { room: { select: { number: true } } },
      });
      if (again) {
        if (again.roomId !== roomId) throw new DomainError("VALIDATION", "Geçersiz istek anahtarı");
        return { success: true, requestId: again.id, roomNumber: again.room.number, replayed: true };
      }

      const today = businessDay(businessDate());
      if (settings["mybar.dailyLimit"]) {
        const used = await tx.mybarRequest.count({
          where: { roomId, businessDate: today, status: { not: "IPTAL" } },
        });
        if (used > 0) {
          throw new DomainError(
            "DAILY_LIMIT",
            "Bugün için odanıza ait bir MyBar talebi zaten bulunmaktadır. Günde maksimum 1 talep iletilebilir.",
          );
        }
      }

      const cat = await roomCatalogue(tx, hotelId, room.roomTypeId);
      const products = await tx.product.findMany({
        where: { id: { in: [...merged.keys()] }, isActive: true },
        select: { id: true },
      });
      const active = new Set(products.map((p) => p.id));
      const lines: { productId: string; qty: number }[] = [];
      for (const [productId, qty] of merged) {
        const cap = cat.caps.get(productId);
        if (cap === undefined || !active.has(productId)) {
          throw new DomainError("VALIDATION", "Seçilen ürün bu odanın minibar listesinde yok.", {
            fieldErrors: { items: [productId] },
          });
        }
        const max = await maxQtyFor(hotelId, cap);
        if (qty > max) {
          throw new DomainError("VALIDATION", `Bir üründen en fazla ${max} adet istenebilir.`, {
            fieldErrors: { items: [productId] },
          });
        }
        lines.push({ productId, qty: settings["mybar.quantityMode"] === "TICK" ? 1 : qty });
      }

      const created = await tx.mybarRequest.create({
        data: {
          hotelId,
          roomId,
          businessDate: today,
          status: "BEKLEMEDE",
          language,
          note: note || null,
          noteTr,
          clientIp: data.ip,
          idempotencyKey: data.idempotencyKey,
          items: { create: lines.map((l) => ({ productId: l.productId, requestedQty: l.qty })) },
        },
      });

      await audit(tx, {
        hotelId,
        action: "MINIBAR_MYBAR_CREATE",
        entity: "MybarRequest",
        entityId: created.id,
        after: { roomId, roomNumber: room.number, items: lines, language, ip: data.ip },
      });
      await publish(
        { type: "mybar.created", hotelId, roomId, payload: { requestId: created.id, roomNumber: room.number } },
        tx as Prisma.TransactionClient,
      );

      return { success: true, requestId: created.id, roomNumber: room.number, replayed: false };
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      const winner = await replayOf(data.idempotencyKey, roomId);
      if (winner) return winner;
    }
    throw error;
  }
}

/** Hotel that owns a MyBar request (used by the route to authorise against the entity's hotel). */
export async function mybarRequestHotel(requestId: string): Promise<string> {
  const req = await prisma.mybarRequest.findUnique({ where: { id: requestId }, select: { hotelId: true } });
  if (!req) throw new DomainError("NOT_FOUND", "MyBar talebi bulunamadı.");
  return req.hotelId;
}

/**
 * 7. MyBar Talebini Onayla (Confirm / Kapat)
 *
 * BEKLEMEDE -> TAMAMLANDI only, under a row lock; the delivered quantities leave the hotel pool
 * (MYBAR movement, FOR UPDATE, never negative) and a MYBAR_KARSILAMA transaction records the fill.
 */
export async function confirmMybarRequest(requestId: string, userId: string, hotelId: string) {
  return prisma.$transaction(async (tx) => {
    await lockRow(tx, "mybar_requests", requestId);
    const req = await tx.mybarRequest.findFirst({
      where: { id: requestId, hotelId },
      include: { room: { select: { id: true, number: true } }, items: true },
    });
    if (!req) throw new DomainError("NOT_FOUND", "MyBar talebi bulunamadı.");
    if (req.status !== "BEKLEMEDE") {
      throw new DomainError("CONFLICT", "Bu MyBar talebi artık beklemede değil.");
    }

    const lines = req.items.map((i) => ({ productId: i.productId, qty: i.requestedQty }));
    const fill = await tx.minibarTransaction.create({
      data: {
        hotelId,
        roomId: req.roomId,
        userId,
        type: "MYBAR_KARSILAMA",
        note: `MyBar talebi karşılandı (#${req.id})`,
      },
    });
    const products = await tx.product.findMany({
      where: { id: { in: lines.map((l) => l.productId) } },
      select: { id: true, purchasePrice: true, salePrice: true },
    });
    const priceOf = new Map(products.map((p) => [p.id, p]));
    for (const line of lines) {
      await tx.minibarTransactionItem.create({
        data: {
          transactionId: fill.id,
          productId: line.productId,
          added: line.qty,
          consumed: 0,
          purchasePrice: priceOf.get(line.productId)?.purchasePrice ?? null,
          salePrice: priceOf.get(line.productId)?.salePrice ?? null,
        },
      });
    }
    await takeManyFromPool(
      tx,
      {
        hotelId,
        userId,
        type: "MYBAR",
        refType: "MybarRequest",
        refId: req.id,
        note: `MyBar: Oda ${req.room.number}`,
      },
      lines,
    );
    for (const item of req.items) {
      await tx.mybarRequestItem.update({ where: { id: item.id }, data: { deliveredQty: item.requestedQty } });
    }

    const completedAt = new Date();
    await tx.mybarRequest.update({
      where: { id: req.id },
      data: { status: "TAMAMLANDI", completedById: userId, completedAt },
    });

    await audit(tx, {
      userId,
      hotelId,
      action: "MINIBAR_MYBAR_CONFIRM",
      entity: "MybarRequest",
      entityId: req.id,
      before: { status: req.status },
      after: {
        status: "TAMAMLANDI",
        completedById: userId,
        completedAt: completedAt.toISOString(),
        roomNumber: req.room.number,
        items: lines,
        transactionId: fill.id,
      },
    });

    return {
      success: true,
      message: `Oda ${req.room.number} için MyBar talebi onaylandı ve kapatıldı.`,
    };
  });
}
