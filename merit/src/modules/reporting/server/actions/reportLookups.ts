"use server";

import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { safeAction, type Result } from "@/lib/result";
import { isOutletSession, listReports } from "@/modules/reporting/server/scope";

export type ReportLookups = {
  hotels: { id: string; name: string }[];
  outlets: { id: string; hotelId: string; name: string }[];
  floors: { id: string; hotelId: string; name: string }[];
  productGroups: { id: string; name: string }[];
  products: { id: string; name: string }[];
  /** Only for callers who can run a report in FULL mode (a self-service caller never picks a person). */
  users: { id: string; name: string }[];
};

const schema = z.object({ hotelIds: z.array(z.string().min(1).max(64)).max(50) });
const CAP = 500;

/** Names behind the id filters of the Rapor Merkezi; always limited to the caller's hotel scope. */
export async function reportLookupsAction(hotelIds: string[]): Promise<Result<ReportLookups>> {
  return safeAction(schema, async (i) => {
    const ctx = await requireUser();
    const ids = [...new Set(i.hotelIds)].filter((h) => ctx.hotelIds.includes(h));
    const full = (await listReports(ctx)).some((r) => r.mode === "FULL");
    const [hotels, outlets, floors, productGroups, products, users] = await Promise.all([
      prisma.hotel.findMany({ where: { id: { in: ids } }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
      isOutletSession(ctx)
        ? []
        : prisma.outlet.findMany({
            where: { hotelId: { in: ids }, isActive: true },
            select: { id: true, hotelId: true, name: true },
            orderBy: [{ hotelId: "asc" }, { name: "asc" }],
            take: CAP,
          }),
      prisma.floor.findMany({
        where: { hotelId: { in: ids } },
        select: { id: true, hotelId: true, name: true },
        orderBy: [{ hotelId: "asc" }, { number: "asc" }],
        take: CAP,
      }),
      prisma.productGroup.findMany({ where: { isActive: true }, select: { id: true, name: true }, orderBy: { name: "asc" }, take: CAP }),
      prisma.product.findMany({ where: { isActive: true }, select: { id: true, name: true }, orderBy: { name: "asc" }, take: CAP }),
      full
        ? prisma.user.findMany({
            where: {
              isActive: true,
              deletedAt: null,
              OR: [{ hotelId: { in: ids } }, { userHotels: { some: { hotelId: { in: ids } } } }],
            },
            select: { id: true, fullName: true },
            orderBy: { fullName: "asc" },
            take: CAP,
          })
        : [],
    ]);
    return { hotels, outlets, floors, productGroups, products, users: users.map((u) => ({ id: u.id, name: u.fullName })) };
  })({ hotelIds });
}
