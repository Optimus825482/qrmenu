import { prisma } from "@/lib/prisma";
import { DomainError } from "@/lib/result";
import { MENU_THEMES } from "../../../../prisma/seed/menuThemes";
import { resolveCurrency, resolvePriceDisplay } from "./priceDisplay";

export type GuestTheme = { bg: string; accent: string; soft: string; textOnAccent: string };

export type GuestState = {
  outletId: string;
  hotelId: string;
  outletName: string;
  hotelName: string;
  menuOpen: boolean;
  orderingOpen: boolean;
  pricesShown: boolean;
  currency: string;
  theme: GuestTheme;
  reason?: "OUTLET_PASIF" | "OTEL_PASIF" | "MENU_KAPALI" | "SIPARIS_KAPALI";
};

const pickTheme = ({ bg, accent, soft, textOnAccent }: GuestTheme): GuestTheme => ({
  bg,
  accent,
  soft,
  textOnAccent,
});

/** Read-only, session-less state of an outlet for guest pages (menu / ordering open, prices, theme). */
export async function guestState(outletId: string): Promise<GuestState> {
  const outlet = await prisma.outlet.findUnique({
    where: { id: outletId },
    include: { hotel: { select: { name: true, isActive: true } }, theme: true },
  });
  if (!outlet) throw new DomainError("NOT_FOUND", "Outlet bulunamadı");
  const modules = await prisma.hotelModule.findMany({
    where: { hotelId: outlet.hotelId, moduleKey: { in: ["QR_MENU", "QR_ORDER"] } },
    select: { moduleKey: true, enabled: true },
  });
  const on = (key: string) => modules.some((m) => m.moduleKey === key && m.enabled);

  const menuOpen = outlet.isActive && outlet.hotel.isActive && outlet.hasMenu && on("QR_MENU");
  const orderingOpen = menuOpen && outlet.hasOrdering && outlet.orderingEnabled && on("QR_ORDER");

  let reason: GuestState["reason"];
  if (!outlet.isActive) reason = "OUTLET_PASIF";
  else if (!outlet.hotel.isActive) reason = "OTEL_PASIF";
  else if (!menuOpen) reason = "MENU_KAPALI";
  else if (!orderingOpen) reason = "SIPARIS_KAPALI";

  const theme =
    outlet.theme ??
    (await prisma.menuTheme.findFirst({ where: { isDefault: true }, orderBy: { createdAt: "asc" } })) ??
    MENU_THEMES[0];

  return {
    outletId: outlet.id,
    hotelId: outlet.hotelId,
    outletName: outlet.name,
    hotelName: outlet.hotel.name,
    menuOpen,
    orderingOpen,
    pricesShown: (await resolvePriceDisplay(outlet)) === "SHOW",
    currency: await resolveCurrency(outlet.hotelId),
    theme: pickTheme(theme),
    ...(reason ? { reason } : {}),
  };
}
