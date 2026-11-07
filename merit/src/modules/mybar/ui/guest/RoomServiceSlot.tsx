import type { Locale } from "@/lib/i18n/locales";
import { RoomServiceCard } from "@/modules/order/ui/guest/RoomServiceCard";
import type { RoomGuestState } from "../../server/roomGuest";

/**
 * Room-service card slot of the room QR page. P6 fills the body with its own card and produces
 * `/q/{token}/oda-servisi`. While the flag is off the room state reports `roomServiceOpen: false`,
 * so the slot is not even reached.
 */
export const ROOM_SERVICE_READY = true;

export default async function RoomServiceSlot({ token, locale, state }: { token: string; locale: Locale; state: RoomGuestState }) {
  // Called as a function: the card is itself an async server component.
  return await RoomServiceCard({ token, locale, state });
}
