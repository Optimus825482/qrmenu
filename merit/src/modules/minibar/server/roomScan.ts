import type { Ctx } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertCan, can } from "@/lib/rbac";
import { createRateLimiter } from "@/lib/rate-limit";
import { DomainError } from "@/lib/result";
import { publishRadar } from "@/modules/radar/publish";

/*
 * The floor attendant's QR reader: a scanned URL (`.../q/{token}`) or a typed code resolves to a room of the
 * user's hotels. The token is looked up as stored (Room.qrToken): the signature is NOT checked, so the old
 * 6-digit codes of the printed labels keep working. Every attempt writes a QrScanLog row.
 */

const SCREEN = "MB-KF";
const TOKEN_RE = /^[A-Za-z0-9_-]{1,64}$/;
const BAD_QR = "QR kod okunamadı";

/** 30 attempts per minute per IP. */
export const qrResolveLimiter = createRateLimiter({ max: 30, windowMs: 60_000 });

/** The room token of a scanned URL (`https://host/q/{token}`) or of a raw code. */
export function extractToken(text: string): string {
  const raw = String(text ?? "").trim();
  let candidate = raw;
  if (/^https?:\/\//i.test(raw)) {
    let path: string;
    try {
      path = new URL(raw).pathname;
    } catch {
      throw new DomainError("VALIDATION", BAD_QR);
    }
    const m = /\/q\/([^/]+)\/?$/.exec(path);
    if (!m) throw new DomainError("VALIDATION", BAD_QR);
    candidate = m[1];
  }
  if (!TOKEN_RE.test(candidate)) throw new DomainError("VALIDATION", BAD_QR);
  return candidate;
}

export type ScanMeta = { ip: string; userAgent: string };

export async function resolveRoomByQr(
  ctx: Ctx,
  raw: string,
  meta: ScanMeta,
  now: Date = new Date(),
): Promise<{ roomId: string; floorId: string; number: string }> {
  void now;
  await assertCan(ctx, SCREEN, "V", ctx.session.hotelId);

  const log = (roomId: string | null, ok: boolean, error?: string) =>
    prisma.qrScanLog.create({
      data: {
        ...(roomId ? { roomId } : {}),
        userId: ctx.user.id,
        kind: "PERSONEL",
        ok,
        ...(error ? { error } : {}),
        ip: meta.ip.slice(0, 64),
        userAgent: meta.userAgent.slice(0, 300),
      },
    });
  const fail = async (roomId: string | null, code: ConstructorParameters<typeof DomainError>[0], message: string) => {
    await log(roomId, false, code);
    throw new DomainError(code, message);
  };

  if (!qrResolveLimiter.hit(meta.ip).allowed) {
    return fail(null, "RATE_LIMITED", "Çok fazla QR okutma denemesi. Lütfen 1 dakika bekleyin.");
  }

  let token: string;
  try {
    token = extractToken(raw);
  } catch (e) {
    if (e instanceof DomainError) return fail(null, e.code, e.message);
    throw e;
  }

  let room = await prisma.room.findUnique({
    where: { qrToken: token },
    select: { id: true, hotelId: true, floorId: true, number: true, isActive: true },
  });
  if (!room) {
    room = await prisma.room.findFirst({
      where: { hotelId: ctx.session.hotelId, number: token, isActive: true },
      select: { id: true, hotelId: true, floorId: true, number: true, isActive: true },
    });
  }
  if (!room || !room.isActive) return fail(null, "NOT_FOUND", "Geçersiz veya tanınmayan QR kod");
  if (!ctx.hotelIds.includes(room.hotelId)) return fail(room.id, "FORBIDDEN", "Bu oda size ait otelde değil");
  // Oda başka bir otelde olabilir: MB-KF yetkisi odanın oteli üzerinden de doğrulanır.
  if (!(await can(ctx, SCREEN, "V", room.hotelId))) return fail(room.id, "FORBIDDEN", "Bu oda size ait otelde değil");

  await log(room.id, true);
  try {
    await publishRadar(
      "scan.room",
      { hotelId: room.hotelId, roomId: room.id },
      { roomId: room.id, roomNumber: room.number, floorId: room.floorId },
    );
  } catch (error) {
    // The scan already succeeded; a radar failure must not break the reader.
    console.error("[roomScan] scan.room", error);
  }
  return { roomId: room.id, floorId: room.floorId, number: room.number };
}
