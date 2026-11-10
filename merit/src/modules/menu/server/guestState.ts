import { prisma } from "@/lib/prisma";
import { DomainError } from "@/lib/result";
import { MENU_THEMES } from "../../../../prisma/seed/menuThemes";
import { resolvePriceDisplay } from "./priceDisplay";
import { designFromStored, type OutletDesign } from "../design";
import type { GuestCallOption } from "../callOptions";
import { listActive } from "./callOptions";

export type GuestTheme = { bg: string; accent: string; soft: string; textOnAccent: string };

export type GuestState = {
  outletId: string;
  hotelId: string;
  outletName: string;
  hotelName: string;
  /** Hotel logo for the opening animation: the uploaded one, else the bundled brand mark of the hotel. */
  hotelLogoUrl?: string;
  menuOpen: boolean;
  orderingOpen: boolean;
  pricesShown: boolean;
  currency: string;
  theme: GuestTheme;
  design: OutletDesign;
  callOptions: GuestCallOption[];
  reason?: "OUTLET_PASIF" | "OTEL_PASIF" | "MENU_KAPALI" | "SIPARIS_KAPALI";
};

/** Theme colors end up in inline CSS custom properties: only plain #rrggbb is trusted. */
const HEX_COLOR = /^#[0-9a-f]{6}$/i;
/** Last resort when no theme row exists: the light ivory default (same values as the seeded default theme). */
const FALLBACK_THEME: GuestTheme = {
  bg: "#fdfbf7",
  accent: "#8c6218",
  soft: "#f4eee1",
  textOnAccent: "#ffffff",
};

const BRAND_LOGOS: Record<string, string> = {
  ROYAL: "/brand/hotels/royal-transparent.webp",
  DIAMOND: "/brand/hotels/diamond-transparent.webp",
  PREMIUM: "/brand/hotels/premium-transparent.webp",
};

const pickTheme = (theme: GuestTheme): GuestTheme => {
  const base = MENU_THEMES.find((t) => t.isDefault) ?? FALLBACK_THEME;
  const color = (value: string, fallback: string) => (HEX_COLOR.test(value) ? value : fallback);
  return {
    bg: color(theme.bg, base.bg),
    accent: color(theme.accent, base.accent),
    soft: color(theme.soft, base.soft),
    textOnAccent: color(theme.textOnAccent, base.textOnAccent),
  };
};

/** Read-only, session-less state of an outlet for guest pages (menu / ordering open, prices, theme). */
export async function guestState(outletId: string, areaId?: string): Promise<GuestState> {
  const outlet = await prisma.outlet.findUnique({
    where: { id: outletId },
    include: { hotel: { select: { name: true, code: true, logoUrl: true, isActive: true } }, theme: true, menuDesign: true },
  });
  if (!outlet) throw new DomainError("NOT_FOUND", "Outlet bulunamadı");
  const area = areaId
    ? await prisma.outletAreaDefinition.findFirst({
        where: { id: areaId, outletId },
        select: { orderingEnabled: true, priceDisplay: true },
      })
    : null;
  const modules = await prisma.hotelModule.findMany({
    where: { hotelId: outlet.hotelId, moduleKey: { in: ["QR_MENU", "QR_ORDER", "ROOM_SERVICE"] } },
    select: { moduleKey: true, enabled: true },
  });
  const on = (key: string) => modules.some((m) => m.moduleKey === key && m.enabled);

  const isRoomService = outlet.type === "ODA_SERVISI";
  const menuOpen = isRoomService
    ? outlet.isActive && outlet.hotel.isActive && outlet.hasMenu && on("ROOM_SERVICE")
    : outlet.isActive && outlet.hotel.isActive && outlet.hasMenu && on("QR_MENU");
  const orderingOpen = isRoomService
    ? menuOpen && outlet.hasOrdering && (area?.orderingEnabled ?? outlet.orderingEnabled)
    : menuOpen && outlet.hasOrdering && (area?.orderingEnabled ?? outlet.orderingEnabled) && on("QR_ORDER");

  let reason: GuestState["reason"];
  if (!outlet.isActive) reason = "OUTLET_PASIF";
  else if (!outlet.hotel.isActive) reason = "OTEL_PASIF";
  else if (!menuOpen) reason = "MENU_KAPALI";
  else if (!orderingOpen) reason = "SIPARIS_KAPALI";

  const theme =
    outlet.theme ??
    (await prisma.menuTheme.findFirst({ where: { isDefault: true }, orderBy: { createdAt: "asc" } })) ??
    MENU_THEMES.find((t) => t.isDefault) ??
    FALLBACK_THEME;
  const design: OutletDesign = designFromStored(outlet.menuDesign);

  return {
    outletId: outlet.id,
    hotelId: outlet.hotelId,
    outletName: outlet.name,
    hotelName: outlet.hotel.name,
    hotelLogoUrl: outlet.hotel.logoUrl || BRAND_LOGOS[outlet.hotel.code.toUpperCase()] || undefined,
    menuOpen,
    orderingOpen,
    pricesShown: (await resolvePriceDisplay({
      hotelId: outlet.hotelId,
      priceDisplay: area?.priceDisplay ?? outlet.priceDisplay,
    })) === "SHOW",
    currency: outlet.currency,
    theme: pickTheme(theme),
    design,
    callOptions: await listActive(outlet.id),
    ...(reason ? { reason } : {}),
  };
}
