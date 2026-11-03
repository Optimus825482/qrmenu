import { prisma } from "@/lib/prisma";
import { getSetting } from "@/lib/settings";
import { DomainError } from "@/lib/result";
import { guestState, type GuestTheme } from "@/modules/menu/server/guestState";
import { getRoomServiceOutlet } from "./outlet";

const DEFAULT_THEME: GuestTheme = {
  bg: "#f4ede2",
  accent: "#8b263e",
  soft: "#fbf8f3",
  textOnAccent: "#ffffff",
};

export type RoomServiceState = {
  roomId: string;
  hotelId: string;
  roomNumber: string;
  hotelName: string;
  roomServiceOpen: boolean;
  orderingOpen: boolean;
  rsOutletId?: string;
  confirmRequired: boolean;
  slaMinutes: number;
  pricesShown: boolean;
  currency: string;
  theme: GuestTheme;
  reason?: "ODA_PASIF" | "OTEL_PASIF" | "MENU_KAPALI" | "SIPARIS_KAPALI";
};

/**
 * Loads guest-facing Room Service state for a room:
 * checks room and hotel active status, room service outlet presence,
 * module status via guestState, phone confirm setting and SLA minutes.
 */
export async function roomServiceState(roomId: string): Promise<RoomServiceState> {
  const room = await prisma.room.findUnique({
    where: { id: roomId },
    include: { hotel: { select: { id: true, name: true, isActive: true } } },
  });
  if (!room) throw new DomainError("NOT_FOUND", "Oda bulunamadı");

  const hotel = room.hotel;
  const slaMinutes = await getSetting("rs.slaMinutes", hotel.id);

  // 1. Room is inactive
  if (!room.isActive) {
    return {
      roomId: room.id,
      hotelId: hotel.id,
      roomNumber: room.number,
      hotelName: hotel.name,
      roomServiceOpen: false,
      orderingOpen: false,
      confirmRequired: false,
      slaMinutes,
      pricesShown: false,
      currency: "EUR",
      theme: DEFAULT_THEME,
      reason: "ODA_PASIF",
    };
  }

  // 2. Hotel is inactive
  if (!hotel.isActive) {
    return {
      roomId: room.id,
      hotelId: hotel.id,
      roomNumber: room.number,
      hotelName: hotel.name,
      roomServiceOpen: false,
      orderingOpen: false,
      confirmRequired: false,
      slaMinutes,
      pricesShown: false,
      currency: "EUR",
      theme: DEFAULT_THEME,
      reason: "OTEL_PASIF",
    };
  }

  // 3. Find room service outlet for this hotel
  const rsOutlet = await getRoomServiceOutlet(hotel.id);
  if (!rsOutlet) {
    return {
      roomId: room.id,
      hotelId: hotel.id,
      roomNumber: room.number,
      hotelName: hotel.name,
      roomServiceOpen: false,
      orderingOpen: false,
      confirmRequired: false,
      slaMinutes,
      pricesShown: false,
      currency: "EUR",
      theme: DEFAULT_THEME,
      reason: "MENU_KAPALI",
    };
  }

  // 4. Delegate to guestState for the ODA_SERVISI outlet
  const state = await guestState(rsOutlet.id);

  let reason: RoomServiceState["reason"] = undefined;
  if (!state.menuOpen) {
    reason = "MENU_KAPALI";
  } else if (!state.orderingOpen) {
    reason = "SIPARIS_KAPALI";
  }

  return {
    roomId: room.id,
    hotelId: hotel.id,
    roomNumber: room.number,
    hotelName: hotel.name,
    roomServiceOpen: state.menuOpen,
    orderingOpen: state.orderingOpen,
    rsOutletId: rsOutlet.id,
    confirmRequired: rsOutlet.phoneConfirmRequired,
    slaMinutes,
    pricesShown: state.pricesShown,
    currency: state.currency,
    theme: state.theme,
    reason,
  };
}
