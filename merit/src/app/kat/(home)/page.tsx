import { requireUser } from "@/lib/auth";
import { visibleScreens } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import KatDashboard, { type KatFilter } from "./KatDashboard";

export const dynamic = "force-dynamic";

/** Floor home: the layout already guards MB-KAT; here the shortcuts are limited to permitted screens. */
export default async function KatPage({
  searchParams,
}: {
  searchParams: Promise<{ filtre?: string | string[]; hotelId?: string | string[] }>;
}) {
  const ctx = await requireUser();
  const visible = new Set(await visibleScreens(ctx));
  const sp = await searchParams;
  const raw = sp.filtre;
  const filtre = typeof raw === "string" ? raw : undefined;
  const rawHotelId = sp.hotelId;
  const reqHotelId = typeof rawHotelId === "string" ? rawHotelId : undefined;

  const userHotels = await prisma.hotel.findMany({
    where: { isActive: true, ...(ctx.user.roleKind === "SISTEM" ? {} : { id: { in: ctx.hotelIds } }) },
    select: { id: true, name: true, code: true },
    orderBy: { name: "asc" },
  });

  const activeHotelId = reqHotelId && userHotels.some((h) => h.id === reqHotelId)
    ? reqHotelId
    : userHotels.find((h) => h.id === ctx.session.hotelId)?.id ?? userHotels[0]?.id ?? "";

  // The filters are the catalogue's MB-PERS / MB-DND screens: only for users who may view them.
  const filter: KatFilter =
    filtre === "mybar" && visible.has("MB-PERS") ? "mybar" : filtre === "dnd" && visible.has("MB-DND") ? "dnd" : null;
  return (
    <KatDashboard
      hotels={userHotels}
      initialHotelId={activeHotelId}
      canSwitchHotel={userHotels.length > 1}
      filter={filter}
      links={{
        occupancy: visible.has("MB-DOL"),
        definitions: visible.has("MB-TAN"),
        stock: visible.has("MB-ZIM"),
        reports: visible.has("MB-RAP"),
      }}
    />
  );
}
