import type { Outlet } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { DomainError } from "@/lib/result";

/**
 * Otelin tek oda servisi outletini döner (P1 tekilliği zorunlu kılar).
 * Tanımlı değilse null döner.
 */
export async function getRoomServiceOutlet(hotelId: string): Promise<Outlet | null> {
  return prisma.outlet.findFirst({
    where: { hotelId, type: "ODA_SERVISI" },
  });
}

/**
 * Otelin tek oda servisi outletini döner; yoksa NOT_FOUND fırlatır.
 */
export async function requireRoomServiceOutlet(hotelId: string): Promise<Outlet> {
  const outlet = await getRoomServiceOutlet(hotelId);
  if (!outlet) {
    throw new DomainError("NOT_FOUND", "Oda servisi outleti tanımlı değil");
  }
  return outlet;
}
