import { getTranslations } from "next-intl/server";
import type { RoomGuestReason } from "../../server/roomGuest";

/** A closed room (inactive room or hotel, MyBar off, empty room): no theme, no hotel data, nothing to submit. */
export default async function RoomUnavailable({ reason }: { reason: RoomGuestReason }) {
  const t = await getTranslations("mybar");
  return (
    <main className="g-unavailable mb-unavailable" data-kind="room" data-reason={reason}>
      <h1>{t("unavailable.title")}</h1>
      <p>{t(`unavailable.${reason}`)}</p>
    </main>
  );
}
