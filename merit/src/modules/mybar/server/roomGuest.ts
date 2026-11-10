import { prisma } from "@/lib/prisma";
import { publish } from "@/lib/realtime";
import type { GuestTarget } from "@/modules/menu/server/guestToken";
import { MYBAR_EVENT_ROLE_KINDS } from "../constants";
import { ROOM_SERVICE_READY } from "../ui/guest/RoomServiceSlot";

// Flipped by P6 (in the slot file) when the room-service guest flow ships; until then no card appears.
export { ROOM_SERVICE_READY };

export type RoomGuestReason = "ODA_PASIF" | "OTEL_PASIF" | "MYBAR_KAPALI";

export type RoomGuestState = {
  roomId: string;
  hotelId: string;
  roomNumber: string;
  floorName: string;
  hotel: { name: string; logoUrl: string | null };
  guestMessage: string | null;
  mybarOpen: boolean;
  roomServiceOpen: boolean;
  reason?: RoomGuestReason;
};

/** Turkish, guest-facing sentence for a closed room (the guest page translates its own copy). */
export const ROOM_CLOSED_MESSAGES: Record<RoomGuestReason, string> = {
  ODA_PASIF: "Bu oda şu an kullanılamıyor",
  OTEL_PASIF: "Bu otel için hizmet şu an kullanılamıyor",
  MYBAR_KAPALI: "Bu oda için MyBar şu an kullanılamıyor",
};

export async function getRoomGuestState(roomId: string): Promise<RoomGuestState> {
  const room = await prisma.room.findUnique({
    where: { id: roomId },
    select: {
      id: true,
      hotelId: true,
      number: true,
      isActive: true,
      guestMessage: true,
      floor: { select: { name: true } },
      hotel: { select: { name: true, logoUrl: true, isActive: true } },
    },
  });
  if (!room) {
    return {
      roomId,
      hotelId: "",
      roomNumber: "",
      floorName: "",
      hotel: { name: "", logoUrl: null },
      guestMessage: null,
      mybarOpen: false,
      roomServiceOpen: false,
      reason: "ODA_PASIF",
    };
  }
  const modules = await prisma.hotelModule.findMany({
    where: { hotelId: room.hotelId, moduleKey: { in: ["MINIBAR", "ROOM_SERVICE"] } },
    select: { moduleKey: true, enabled: true },
  });
  const on = (key: string) => modules.some((m) => m.moduleKey === key && m.enabled);
  const moduleOpen = on("MINIBAR");
  // Occupancy is deliberately NOT consulted (as in the legacy app): the in-house list can be late,
  // partial or wrong, and a guest holding the room's printed card must always reach MyBar.
  const mybarOpen = room.isActive && room.hotel.isActive && moduleOpen;
  let roomServiceOpen = false;
  if (ROOM_SERVICE_READY && room.isActive && room.hotel.isActive && on("ROOM_SERVICE")) {
    roomServiceOpen =
      (await prisma.outlet.count({ where: { hotelId: room.hotelId, type: "ODA_SERVISI", isActive: true } })) > 0;
  }

  let reason: RoomGuestReason | undefined;
  if (!mybarOpen && !roomServiceOpen) {
    reason = !room.isActive
      ? "ODA_PASIF"
      : !room.hotel.isActive
        ? "OTEL_PASIF"
        : "MYBAR_KAPALI";
  }
  return {
    roomId: room.id,
    hotelId: room.hotelId,
    roomNumber: room.number,
    floorName: room.floor.name,
    hotel: { name: room.hotel.name, logoUrl: room.hotel.logoUrl },
    guestMessage: room.guestMessage,
    mybarOpen,
    roomServiceOpen,
    ...(reason ? { reason } : {}),
  };
}

/** Page-load variant: state plus the `scan.room` pulse for staff screens. Audit-free; the scan log is written by token resolution. */
export async function openRoom(target: Extract<GuestTarget, { kind: "ROOM" }>): Promise<RoomGuestState> {
  const state = await getRoomGuestState(target.roomId);
  try {
    await publish({
      type: "scan.room",
      hotelId: state.hotelId,
      roomId: state.roomId,
      roleKinds: MYBAR_EVENT_ROLE_KINDS,
      payload: { roomId: state.roomId },
    });
  } catch (error) {
    console.error("[mybar] scan.room", error);
  }
  return state;
}
