import type { Prisma } from "@/generated/prisma/client";
import type { Ctx } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DomainError } from "@/lib/result";
import { assertCan, can } from "@/lib/rbac";

const SCREEN = "CR-REH";
const DEFINITIONS_APP = "core.tanimlar";
/** The staff roles the guide asks for (seeded role codes). */
const FLOOR_ROLE = "R-KAT";
const WAITER_ROLE = "R-GAR";

export type SetupStepKey =
  | "otel-bilgi"
  | "katlar"
  | "oda-tipleri"
  | "odalar"
  | "oda-tipi-atama"
  | "outletler"
  | "masalar"
  | "kullanicilar"
  | "ekipler"
  | "urun-setup";

export type SetupStep = {
  key: SetupStepKey;
  title: string;
  done: boolean;
  /** How many records satisfy the step (what the guide shows next to the title). */
  count: number;
  /** Counts towards `percent`; false when the step does not apply to this hotel (yet). */
  required: boolean;
  /** Where "Aç" goes: an app and, for Tanımlamalar, the tree node. */
  openApp: { appId: string; panel?: string };
};

export type SetupStatus = {
  /** Share (0-100, rounded) of the required steps that are done. */
  percent: number;
  steps: SetupStep[];
};

export type SetupSummaryRow = { hotelId: string; code: string; name: string; percent: number };

const toPercent = (steps: SetupStep[]): number => {
  const required = steps.filter((s) => s.required);
  if (required.length === 0) return 100;
  return Math.round((required.filter((s) => s.done).length / required.length) * 100);
};

/** Setup progress of one hotel; no authorisation (the callers assert CR-REH first). */
async function compute(hotelId: string): Promise<SetupStatus> {
  const hotel = await prisma.hotel.findUnique({ where: { id: hotelId }, select: { name: true, address: true } });
  if (!hotel) throw new DomainError("NOT_FOUND", "Otel bulunamadı");

  // Order outlets: the room-service outlet is created with every hotel and has no tables or team.
  const orderOutlets: Prisma.OutletWhereInput = {
    hotelId,
    isActive: true,
    hasOrdering: true,
    type: { not: "ODA_SERVISI" },
  };
  const staffOf = (roleCode: string): Prisma.UserWhereInput => ({
    isActive: true,
    role: { code: roleCode },
    OR: [{ hotelId }, { userHotels: { some: { hotelId } } }],
  });

  const [modules, floors, roomTypes, rooms, typedRooms, outlets, tables, members, floorStaff, waiters] =
    await Promise.all([
      prisma.hotelModule.findMany({ where: { hotelId, enabled: true }, select: { moduleKey: true } }),
      prisma.floor.count({ where: { hotelId, isActive: true } }),
      prisma.roomType.count({ where: { hotelId, isActive: true } }),
      prisma.room.count({ where: { hotelId, isActive: true } }),
      prisma.room.count({ where: { hotelId, isActive: true, roomTypeId: { not: null } } }),
      prisma.outlet.count({ where: { hotelId, isActive: true, type: { not: "ODA_SERVISI" } } }),
      prisma.outletTable.count({ where: { isActive: true, outlet: orderOutlets } }),
      prisma.outletMember.count({ where: { isActive: true, outlet: orderOutlets, user: { isActive: true } } }),
      prisma.user.count({ where: staffOf(FLOOR_ROLE) }),
      prisma.user.count({ where: staffOf(WAITER_ROLE) }),
    ]);

  const enabled = new Set(modules.map((m) => m.moduleKey));
  const qrMenu = enabled.has("QR_MENU");
  const qrOrder = enabled.has("QR_ORDER");
  const minibar = enabled.has("MINIBAR");

  // Users: a floor attendant when Minibar is on, a waiter when QR Sipariş is on.
  const staffNeeds = [...(minibar ? [floorStaff] : []), ...(qrOrder ? [waiters] : [])];

  const tanimlar = (panel: string) => ({ appId: DEFINITIONS_APP, panel });
  const steps: SetupStep[] = [
    {
      key: "otel-bilgi",
      title: "Otel bilgileri",
      done: hotel.name.trim().length > 0,
      count: (hotel.name.trim() ? 1 : 0) + (hotel.address?.trim() ? 1 : 0),
      required: true,
      openApp: tanimlar("otel"),
    },
    { key: "katlar", title: "Katlar", done: floors >= 1, count: floors, required: true, openApp: tanimlar("katlar") },
    {
      key: "oda-tipleri",
      title: "Oda tipleri",
      done: roomTypes >= 1,
      count: roomTypes,
      required: true,
      openApp: tanimlar("oda-tipleri"),
    },
    { key: "odalar", title: "Odalar", done: rooms >= 1, count: rooms, required: true, openApp: tanimlar("odalar") },
    {
      key: "oda-tipi-atama",
      title: "Odalara oda tipi atama",
      done: rooms >= 1 && typedRooms === rooms,
      count: typedRooms,
      required: true,
      openApp: tanimlar("odalar"),
    },
    {
      key: "outletler",
      title: "Outletler",
      done: outlets >= 1,
      count: outlets,
      required: qrMenu || qrOrder,
      openApp: tanimlar("outletler"),
    },
    {
      key: "masalar",
      title: "Sipariş outletlerinde masalar",
      done: tables >= 1,
      count: tables,
      required: qrOrder,
      openApp: tanimlar("masalar"),
    },
    {
      key: "kullanicilar",
      title: "Kat sorumlusu ve garson kullanıcıları",
      done: staffNeeds.length > 0 && staffNeeds.every((n) => n >= 1),
      count: staffNeeds.reduce((sum, n) => sum + n, 0),
      required: staffNeeds.length > 0,
      openApp: { appId: "core.kullanici", panel: "users" },
    },
    {
      key: "ekipler",
      title: "Sipariş outletlerinde ekip",
      done: members >= 1,
      count: members,
      required: qrOrder,
      openApp: { appId: "core.ekipler" },
    },
    // Added with the product module (P2); not a registered app yet, so the guide cannot open it.
    {
      key: "urun-setup",
      title: "Ürün ve minibar setup",
      done: false,
      count: 0,
      required: false,
      openApp: { appId: "minibar.tanim", panel: "urun-setup" },
    },
  ];
  return { percent: toPercent(steps), steps };
}

/** Setup steps of one hotel in order, with the completion percentage of the required ones. */
export async function status(ctx: Ctx, hotelId: string): Promise<SetupStatus> {
  await assertCan(ctx, SCREEN, "V", hotelId);
  return compute(hotelId);
}

/** Setup percentage of every active hotel in the caller's scope that they may view the guide of. */
export async function summary(ctx: Ctx): Promise<SetupSummaryRow[]> {
  const checks = await Promise.all(
    ctx.hotelIds.map(async (id) => ((await can(ctx, SCREEN, "V", id)) ? id : undefined)),
  );
  const ids = checks.filter((id): id is string => id !== undefined);
  if (ids.length === 0) {
    await assertCan(ctx, SCREEN, "V", ctx.session.hotelId); // audits the denied attempt
    throw new DomainError("FORBIDDEN", "Bu ekran için yetkiniz yok");
  }
  const hotels = await prisma.hotel.findMany({
    where: { id: { in: ids }, isActive: true },
    select: { id: true, code: true, name: true },
    orderBy: { name: "asc" },
  });
  return Promise.all(
    hotels.map(async (h) => ({ hotelId: h.id, code: h.code, name: h.name, percent: (await compute(h.id)).percent })),
  );
}
