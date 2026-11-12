import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { DomainError } from "@/lib/result";
import { getSettings } from "@/lib/settings";

/*
 * Room verification proof for `minibar.requireQrForControl` (KAT-1/KAT-2). A successful room scan of the
 * floor attendant (`resolveRoomByQr`) writes a `QrScanLog` row (ok, PERSONEL, user, room); that row is the
 * proof for the next QR_PROOF_MINUTES. The room check writers (replacement, "Sarfiyat Yok") ask for it
 * on the server, so neither a URL parameter nor a direct API call bypasses the QR. DND and MMD never ask:
 * both are recorded exactly when the attendant could not get into the room. A typed room number is
 * accepted only where the hotel allows manual entry (whole hotel, listed floors or listed rooms); every such
 * verification is audited as ELLE (`ODA_DOGRULAMA_ELLE`).
 */

export const QR_PROOF_MINUTES = 10;
export const MANUAL_VERIFY_ACTION = "ODA_DOGRULAMA_ELLE";
export const QR_REQUIRED_MESSAGE = "Bu oda için QR doğrulaması gerekli. Lütfen odadaki QR kodu okutun.";

type Reader = Pick<Prisma.TransactionClient, "qrScanLog">;

/** True when the user resolved this room by a successful scan within the last QR_PROOF_MINUTES. */
export async function hasRoomProof(
  db: Reader,
  p: { userId: string; roomId: string },
  now: Date = new Date(),
): Promise<boolean> {
  const since = new Date(now.getTime() - QR_PROOF_MINUTES * 60_000);
  const row = await db.qrScanLog.findFirst({
    where: { userId: p.userId, roomId: p.roomId, kind: "PERSONEL", ok: true, createdAt: { gte: since, lte: now } },
    select: { id: true },
  });
  return row !== null;
}

/** Throws FORBIDDEN when the hotel requires QR and the user has no fresh proof for the room. */
export async function assertRoomVerified(
  p: { userId: string; roomId: string; hotelId: string },
  now: Date = new Date(),
  db: Reader = prisma,
): Promise<void> {
  const { "minibar.requireQrForControl": required } = await getSettings(["minibar.requireQrForControl"], p.hotelId);
  if (!required) return;
  if (await hasRoomProof(db, p, now)) return;
  throw new DomainError("FORBIDDEN", QR_REQUIRED_MESSAGE);
}

export type ManualEntryRule = { enabled: boolean; floorIds: string[]; roomIds: string[] };

export async function manualEntryRule(hotelId: string): Promise<ManualEntryRule> {
  const s = await getSettings(
    ["minibar.manualRoomEntry", "minibar.manualRoomEntryFloorIds", "minibar.manualRoomEntryRoomIds"],
    hotelId,
  );
  return {
    enabled: s["minibar.manualRoomEntry"],
    floorIds: s["minibar.manualRoomEntryFloorIds"],
    roomIds: s["minibar.manualRoomEntryRoomIds"],
  };
}

/** Pure: manual (typed room number) entry is allowed for the room by the hotel, its floor or the room itself. */
export function manualEntryAllows(rule: ManualEntryRule, room: { id: string; floorId: string }): boolean {
  return rule.enabled || rule.floorIds.includes(room.floorId) || rule.roomIds.includes(room.id);
}

/**
 * Whether a typed room number may open the room. Without the QR requirement the room number keeps working
 * as before; with it, only where `manualEntryAllows`.
 */
export async function manualEntryAllowed(room: { id: string; hotelId: string; floorId: string }): Promise<boolean> {
  const { "minibar.requireQrForControl": required } = await getSettings(["minibar.requireQrForControl"], room.hotelId);
  if (!required) return true;
  return manualEntryAllows(await manualEntryRule(room.hotelId), room);
}

/** What the reader page shows: "ALL" (no QR rule or the whole hotel), "SOME" (listed floors/rooms) or "NONE". */
export async function manualEntryMode(hotelId: string): Promise<"ALL" | "SOME" | "NONE"> {
  const { "minibar.requireQrForControl": required } = await getSettings(["minibar.requireQrForControl"], hotelId);
  if (!required) return "ALL";
  const rule = await manualEntryRule(hotelId);
  if (rule.enabled) return "ALL";
  return rule.floorIds.length > 0 || rule.roomIds.length > 0 ? "SOME" : "NONE";
}
