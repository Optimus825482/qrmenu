import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Icon } from "@/components/icons/Icon";
import type { Locale } from "@/lib/i18n/locales";
import type { RoomGuestState } from "@/modules/mybar/server/roomGuest";
import { roomServiceState } from "../../server/roomService/roomState";

/**
 * Room-service card of the room QR page (`RoomServiceSlot` renders it). The room-service outlet's own
 * state is loaded here: a closed or empty menu turns the card into a plain "currently unavailable"
 * note, and a menu that is not taking orders keeps the card open with the ordering-closed line.
 */
export async function RoomServiceCard({ token, state }: { token: string; locale: Locale; state: RoomGuestState }) {
  const [t, rs] = await Promise.all([getTranslations("guest"), roomServiceState(state.roomId)]);
  const body = (
    <>
      <Icon name="utensils" size={28} />
      <span>
        <span className="mb-choice-title">{t("room.card.roomService")}</span>
        <span className="mb-muted">{t("room.card.roomServiceHint")}</span>
        {!rs.roomServiceOpen ? (
          <span className="mb-muted" role="status">
            {t("rs.unavailable")}
          </span>
        ) : !rs.orderingOpen ? (
          <span className="mb-muted" role="status">
            {t("menu.orderingClosed")}
          </span>
        ) : null}
      </span>
    </>
  );
  if (!rs.roomServiceOpen) {
    return (
      <div className="mb-choice" aria-disabled="true" style={{ opacity: 0.6 }}>
        {body}
      </div>
    );
  }
  return (
    <Link className="mb-choice" href={`/q/${encodeURIComponent(token)}/oda-servisi`}>
      {body}
    </Link>
  );
}
