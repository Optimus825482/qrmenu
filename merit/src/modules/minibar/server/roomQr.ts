import { zipSync } from "fflate";
import type { Ctx } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertCan } from "@/lib/rbac";
import { generateQrToken, isSignedToken, qrUrl, renderQrPng, renderQrSvg, verifyQrToken } from "@/lib/qr";
import { DomainError } from "@/lib/result";
import { audit } from "@/modules/core/server/audit";

export type RoomQrRow = {
  id: string;
  number: string;
  floorId: string;
  floorNumber: number;
  roomTypeName?: string | null;
  isActive: boolean;
  signed: boolean;
  url: string;
};

const isSigned = (token: string | null, roomId: string) =>
  token !== null && isSignedToken(token) && verifyQrToken(token, "ROOM", roomId);

export async function listRoomQr(
  ctx: Ctx,
  hotelId: string,
  floorId?: string,
): Promise<RoomQrRow[]> {
  if (!ctx.hotelIds.includes(hotelId)) {
    throw new DomainError("FORBIDDEN", "Bu otele erişim yetkiniz yok");
  }
  await assertCan(ctx, "MB-KF", "V", hotelId);

  const where: { hotelId: string; floorId?: string } = { hotelId };
  if (floorId) where.floorId = floorId;

  const rooms = await prisma.room.findMany({
    where,
    include: {
      floor: { select: { number: true } },
      roomType: { select: { name: true } },
    },
    orderBy: [{ floor: { number: "asc" } }, { number: "asc" }],
  });

  const rows: RoomQrRow[] = [];
  for (const r of rooms) {
    const signed = isSigned(r.qrToken, r.id);
    const url = r.qrToken ? await qrUrl(r.qrToken) : "";
    rows.push({
      id: r.id,
      number: r.number,
      floorId: r.floorId,
      floorNumber: r.floor.number,
      roomTypeName: r.roomType?.name,
      isActive: r.isActive,
      signed,
      url,
    });
  }
  return rows;
}

export async function regenerateRoomQr(ctx: Ctx, roomId: string): Promise<RoomQrRow> {
  const room = await prisma.room.findUnique({
    where: { id: roomId },
    include: {
      floor: { select: { number: true } },
      roomType: { select: { name: true } },
    },
  });
  if (!room) throw new DomainError("NOT_FOUND", "Oda bulunamadı");
  if (!ctx.hotelIds.includes(room.hotelId)) {
    throw new DomainError("FORBIDDEN", "Bu otele erişim yetkiniz yok");
  }
  await assertCan(ctx, "MB-KF", "D", room.hotelId);

  const token = generateQrToken("ROOM", room.id);
  const updated = await prisma.room.update({
    where: { id: roomId },
    data: { qrToken: token },
    include: {
      floor: { select: { number: true } },
      roomType: { select: { name: true } },
    },
  });

  await audit(prisma, {
    userId: ctx.user.id,
    action: "UPDATE",
    entity: "Room",
    entityId: room.id,
    hotelId: room.hotelId,
    after: { qrToken: token },
    before: { qrToken: room.qrToken },
  });

  const url = await qrUrl(token);
  return {
    id: updated.id,
    number: updated.number,
    floorId: updated.floorId,
    floorNumber: updated.floor.number,
    roomTypeName: updated.roomType?.name,
    isActive: updated.isActive,
    signed: true,
    url,
  };
}

export async function regenerateAllRoomQr(
  ctx: Ctx,
  hotelId: string,
  floorId?: string,
  onlyUnsigned = true,
): Promise<{ count: number }> {
  if (!ctx.hotelIds.includes(hotelId)) {
    throw new DomainError("FORBIDDEN", "Bu otele erişim yetkiniz yok");
  }
  await assertCan(ctx, "MB-KF", "D", hotelId);

  const where: { hotelId: string; floorId?: string } = { hotelId };
  if (floorId) where.floorId = floorId;

  const rooms = await prisma.room.findMany({
    where,
    select: { id: true, qrToken: true },
  });

  let count = 0;
  for (const r of rooms) {
    if (onlyUnsigned && isSigned(r.qrToken, r.id)) continue;
    const token = generateQrToken("ROOM", r.id);
    await prisma.room.update({
      where: { id: r.id },
      data: { qrToken: token },
    });
    count++;
  }

  await audit(prisma, {
    userId: ctx.user.id,
    action: "UPDATE",
    entity: "Hotel",
    entityId: hotelId,
    hotelId,
    after: { bulkRoomQrCount: count },
  });

  return { count };
}

export async function downloadRoomQr(
  ctx: Ctx,
  roomId: string,
  format: "svg" | "png",
): Promise<{ filename: string; contentType: string; body: Buffer }> {
  const room = await prisma.room.findUnique({
    where: { id: roomId },
    include: { hotel: { select: { code: true } } },
  });
  if (!room) throw new DomainError("NOT_FOUND", "Oda bulunamadı");
  if (!ctx.hotelIds.includes(room.hotelId)) {
    throw new DomainError("FORBIDDEN", "Bu otele erişim yetkiniz yok");
  }
  await assertCan(ctx, "MB-KF", "V", room.hotelId);

  let token = room.qrToken;
  if (!token || !isSigned(token, room.id)) {
    token = generateQrToken("ROOM", room.id);
    await prisma.room.update({ where: { id: room.id }, data: { qrToken: token } });
  }

  const url = await qrUrl(token);
  const cleanNumber = room.number.replace(/\s+/g, "_");
  const filename = `${room.hotel.code}_Oda_${cleanNumber}.${format}`;

  if (format === "svg") {
    const svg = await renderQrSvg(url);
    return { filename, contentType: "image/svg+xml; charset=utf-8", body: Buffer.from(svg, "utf8") };
  }
  const png = await renderQrPng(url);
  return { filename, contentType: "image/png", body: png };
}

export async function downloadRoomQrZip(
  ctx: Ctx,
  hotelId: string,
  floorId?: string,
): Promise<{ filename: string; body: Buffer }> {
  const hotel = await prisma.hotel.findUnique({
    where: { id: hotelId },
    select: { id: true, code: true, name: true },
  });
  if (!hotel) throw new DomainError("NOT_FOUND", "Otel bulunamadı");
  if (!ctx.hotelIds.includes(hotelId)) {
    throw new DomainError("FORBIDDEN", "Bu otele erişim yetkiniz yok");
  }
  await assertCan(ctx, "MB-KF", "V", hotelId);

  const where: { hotelId: string; floorId?: string } = { hotelId };
  if (floorId) where.floorId = floorId;

  const rooms = await prisma.room.findMany({
    where,
    include: { floor: { select: { number: true } } },
    orderBy: [{ floor: { number: "asc" } }, { number: "asc" }],
  });

  const files: Record<string, Uint8Array> = {};
  for (const r of rooms) {
    let token = r.qrToken;
    if (!token || !isSigned(token, r.id)) {
      token = generateQrToken("ROOM", r.id);
      await prisma.room.update({ where: { id: r.id }, data: { qrToken: token } });
    }
    const url = await qrUrl(token);
    const svg = await renderQrSvg(url);
    const cleanNumber = r.number.replace(/\s+/g, "_");
    files[`Kat_${r.floor.number}/Oda_${cleanNumber}.svg`] = Buffer.from(svg, "utf8");
  }

  const zipped = zipSync(files);
  const filename = `${hotel.code}_Odalar_QR_Kodlari.zip`;
  return { filename, body: Buffer.from(zipped) };
}
