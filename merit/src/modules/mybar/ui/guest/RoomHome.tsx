import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { Icon } from "@/components/icons/Icon";
import type { Locale } from "@/lib/i18n/locales";
import { getSetting } from "@/lib/settings";
import { roomCatalog } from "../../server/catalog";
import { roomRequestStatus } from "../../server/guestRequest";
import type { RoomGuestState } from "../../server/roomGuest";
import { MybarForm } from "./MybarForm";
import RoomServiceSlot from "./RoomServiceSlot";

/** MyBar form for the room: catalogue, today's request and the hotel's daily-limit setting, read on the server. */
export async function RoomMybar({ token, locale, state }: { token: string; locale: Locale; state: RoomGuestState }) {
  const [catalog, status, dailyLimit] = await Promise.all([
    roomCatalog(state.roomId, locale),
    roomRequestStatus(state.roomId, locale),
    getSetting("mybar.dailyLimit", state.hotelId),
  ]);
  return (
    <MybarForm
      token={token}
      locale={locale}
      catalog={catalog}
      dailyLimit={dailyLimit !== false}
      initialRequest={status.request}
    />
  );
}

/**
 * Body of `/q/{token}` for a room: only MyBar open -> the form inline (as in the live template);
 * both services -> a two-card chooser; only room service -> straight to its page.
 */
export default async function RoomHome({ token, locale, state }: { token: string; locale: Locale; state: RoomGuestState }) {
  if (state.mybarOpen && state.roomServiceOpen) {
    const t = await getTranslations("mybar");
    return (
      <nav className="mb-chooser" aria-labelledby="mb-chooser-title">
        <h2 id="mb-chooser-title" className="mb-label">
          {t("chooser.title")}
        </h2>
        <Link className="mb-choice" href={`/q/${encodeURIComponent(token)}/mybar`}>
          <Icon name="minibar" size={28} />
          <span>
            <span className="mb-choice-title">{t("chooser.mybar")}</span>
            <span className="mb-muted">{t("chooser.mybarDesc")}</span>
          </span>
        </Link>
        <RoomServiceSlot token={token} locale={locale} state={state} />
      </nav>
    );
  }
  if (state.mybarOpen) return <RoomMybar token={token} locale={locale} state={state} />;
  if (state.roomServiceOpen) redirect(`/q/${encodeURIComponent(token)}/oda-servisi`);
  return null; // closed rooms are rendered by the layout
}
