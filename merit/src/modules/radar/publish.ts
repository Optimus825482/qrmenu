// Server side: the only way radar wire events are published. Validates the payload against the
// strict RADAR_WIRE schema (no prices, notes, IPs) and applies the single `roleKinds` table.
import type { Prisma } from "@/generated/prisma/client";
import { publish } from "@/lib/realtime";
import { DomainError } from "@/lib/result";
import { WIRE_ROLE_KINDS } from "./constants";
import { RADAR_WIRE, type Wire } from "./events";

export type RadarBase = { hotelId: string; outletId?: string; roomId?: string };

export async function publishRadar<K extends keyof Wire>(
  type: K,
  base: RadarBase,
  payload: Wire[K],
  tx?: Prisma.TransactionClient,
): Promise<void> {
  const parsed = RADAR_WIRE[type].safeParse(payload);
  if (!parsed.success) {
    const where = parsed.error.issues.map((i) => i.path.join(".") || "(kök)").join(", ");
    throw new DomainError("INTERNAL", `Radar olay yükü geçersiz: ${type} (${where})`);
  }
  const roleKinds = WIRE_ROLE_KINDS[type] ?? undefined;
  await publish(
    {
      type,
      hotelId: base.hotelId,
      ...(base.outletId ? { outletId: base.outletId } : {}),
      ...(base.roomId ? { roomId: base.roomId } : {}),
      ...(roleKinds ? { roleKinds } : {}),
      payload: parsed.data,
    },
    tx,
  );
}

/**
 * G20 hand-off: announces a failed hotel mail (SISTEM sessions only). Never throws; the mail path
 * must not break because the radar could not be told. Called by `sendHotelMailOnce` on the "failed"
 * outcome (minibar Task 11) and by the P7 mail jobs, once per failed send.
 */
export async function publishMailFailed(hotelId: string, kind: string): Promise<void> {
  try {
    await publishRadar("mail.failed", { hotelId }, { kind: kind.slice(0, 32) });
  } catch (error) {
    console.error("[radar] mail.failed", error);
  }
}
