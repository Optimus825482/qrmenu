import { prisma } from "@/lib/prisma";
import { getSetting } from "@/lib/settings";
import { normalizeGeminiModel } from "@/modules/menu/server/translations";
import { getBusinessDate } from "./minibarService";

export interface MybarProductOption {
  id: string;
  name: string;
  unit: string;
  groupName: string;
}

/**
 * Translates guest note in any language (EN, RU, DE, AR, etc.) into Turkish using Gemini.
 */
export async function translateNoteToTurkish(text: string): Promise<string> {
  const trimmed = text.trim();
  if (!trimmed) return "";

  try {
    const apiKey = (await getSetting("translation.geminiKey")) as string;
    const model = (await getSetting("translation.geminiModel")) as string;

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

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${activeModel}:generateContent?key=${apiKey}`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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

/**
 * Loads room info, products and checks if today's quota is already used.
 */
export async function getMybarRoomDetails(roomId: string, hotelId: string) {
  const today = getBusinessDate();

  const room = await prisma.room.findFirst({
    where: { id: roomId, hotelId },
    include: {
      hotel: { select: { id: true, name: true, code: true, logoUrl: true } },
      roomType: { select: { id: true, name: true } },
    },
  });
  if (!room) {
    throw new Error("Oda bulunamadı.");
  }

  // Check if request already submitted today (Rule: max 1 request per room per day!)
  const existingTodayRequest = await prisma.mybarRequest.findFirst({
    where: {
      hotelId,
      roomId: room.id,
      businessDate: today,
    },
    include: {
      items: {
        include: {
          product: { select: { name: true } },
        },
      },
    },
  });

  // Get setups assigned to this room type
  let assignedSetups: { setupId: string }[] = [];
  if (room.roomTypeId) {
    assignedSetups = await prisma.roomTypeSetup.findMany({
      where: {
        hotelId,
        roomTypeId: room.roomTypeId,
      },
      select: { setupId: true },
    });
  }

  const setupIds = assignedSetups.map((s) => s.setupId);
  const setups = await prisma.setup.findMany({
    where: setupIds.length > 0 ? { id: { in: setupIds }, isActive: true } : { isActive: true },
    include: {
      items: {
        include: {
          product: {
            include: {
              group: { select: { name: true } },
            },
          },
        },
      },
    },
  });

  // Unique products from setups
  const productMap = new Map<string, MybarProductOption>();
  for (const setup of setups) {
    for (const it of setup.items) {
      if (it.product && it.product.isActive) {
        productMap.set(it.product.id, {
          id: it.product.id,
          name: it.product.name,
          unit: it.product.unit || "Adet",
          groupName: it.product.group?.name || "Minibar",
        });
      }
    }
  }

  // If no setup products found, load all active products
  if (productMap.size === 0) {
    const allProds = await prisma.product.findMany({
      where: { isActive: true },
      include: { group: { select: { name: true } } },
    });
    for (const p of allProds) {
      productMap.set(p.id, {
        id: p.id,
        name: p.name,
        unit: p.unit || "Adet",
        groupName: p.group?.name || "Minibar",
      });
    }
  }

  const products = Array.from(productMap.values());

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

/**
 * Creates a MyBar request from guest phone with auto Gemini Turkish translation for notes.
 */
export async function createGuestMybarRequest(params: {
  hotelId: string;
  roomId: string;
  language: string;
  note?: string;
  clientIp: string;
  items: { productId: string; qty: number }[];
}) {
  const { hotelId, roomId, language, note, clientIp, items } = params;
  const today = getBusinessDate();

  // Validate rule: Max 1 request per room per day!
  const existing = await prisma.mybarRequest.findFirst({
    where: {
      hotelId,
      roomId,
      businessDate: today,
    },
  });
  if (existing) {
    throw new Error("Bugün için odanıza ait bir MyBar talebi zaten bulunmaktadır. Günde maksimum 1 talep iletilebilir.");
  }

  const validItems = items.filter((it) => it.qty > 0 && it.qty <= 5);
  if (validItems.length === 0) {
    throw new Error("Lütfen en az bir ürün seçiniz.");
  }

  // Translate guest note to Turkish if provided
  let noteTr: string | null = null;
  if (note && note.trim()) {
    noteTr = await translateNoteToTurkish(note.trim());
  }

  const req = await prisma.mybarRequest.create({
    data: {
      hotelId,
      roomId,
      businessDate: today,
      status: "BEKLEMEDE",
      language: language || "tr",
      note: note?.trim() || null,
      noteTr,
      clientIp: clientIp || "127.0.0.1",
      idempotencyKey: `mybar-guest-${roomId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      items: {
        create: validItems.map((it) => ({
          productId: it.productId,
          requestedQty: it.qty,
        })),
      },
    },
    include: {
      room: { select: { number: true } },
    },
  });

  return {
    success: true,
    requestId: req.id,
    roomNumber: req.room.number,
  };
}
