import type { Locale } from "@/lib/i18n/locales";
import type { RoomGuestState } from "../../server/roomGuest";

/**
 * Room-service card slot of the room QR page. P6 flips the flag, fills the body with its own card and
 * produces `/q/{token}/oda-servisi`; P4 never renders anything here. While the flag is off the room
 * state reports `roomServiceOpen: false`, so the slot is not even reached.
 */
export const ROOM_SERVICE_READY = false;

export default function RoomServiceSlot(props: { token: string; locale: Locale; state: RoomGuestState }) {
  void props;
  return null;
}
