import { getLocale, getTranslations } from "next-intl/server";
import { notFound, redirect } from "next/navigation";
import type { Locale } from "@/lib/i18n/locales";
import { getMenu } from "@/modules/menu/server/guestMenu";
import { GuestFooter } from "@/modules/menu/ui/guest/GuestFooter";
import { GuestFrame } from "@/modules/menu/ui/guest/GuestFrame";
import { MenuBrowser } from "@/modules/menu/ui/guest/MenuBrowser";
import { roomServiceState } from "@/modules/order/server/roomService/roomState";
import { getGuestTarget, getRoomPageState } from "../guestTarget";

export const dynamic = "force-dynamic";

/**
 * `/q/{token}/oda-servisi`: the room-service menu of a room QR, with the room's own state only (the
 * token decides the room). It sits inside the room frame, so the menu frame is embedded.
 */
export default async function RoomServicePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const target = await getGuestTarget(token);
  if (target.kind !== "ROOM") notFound();
  const home = `/q/${encodeURIComponent(token)}`;
  const room = await getRoomPageState(target.roomId, target.hotelId);
  if (!room.roomServiceOpen) redirect(home);
  const state = await roomServiceState(target.roomId);
  if (!state.rsOutletId) redirect(home);

  const [locale, t] = await Promise.all([getLocale() as Promise<Locale>, getTranslations("guest")]);
  const menu = await getMenu(state.rsOutletId, locale);
  if (!menu.state.menuOpen) {
    return (
      <p className="g-empty" role="status">
        {t("rs.unavailable")}
      </p>
    );
  }
  const place = state.roomNumber;
  return (
    <GuestFrame
      token={token}
      locale={locale}
      theme={menu.state.theme}
      design={menu.state.design}
      outletName={menu.state.outletName}
      placeLabel={place}
      embedded
      footer={
        <GuestFooter
          token={token}
          locale={locale}
          mode="room"
          orderingOpen={menu.state.orderingOpen}
          pricesShown={menu.state.pricesShown}
          currency={menu.state.currency}
        />
      }
    >
      <MenuBrowser token={token} locale={locale} menu={menu} mode="room" />
    </GuestFrame>
  );
}
