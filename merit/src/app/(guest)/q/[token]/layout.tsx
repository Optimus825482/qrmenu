import type { Metadata, Viewport } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { isRtl, type Locale } from "@/lib/i18n/locales";
import { CallWaiterButton } from "@/modules/menu/ui/guest/CallWaiterButton";
import { GuestFooter } from "@/modules/menu/ui/guest/GuestFooter";
import { GuestFrame, HtmlLangSync } from "@/modules/menu/ui/guest/GuestFrame";
import { localizeTexts } from "@/modules/mybar/server/translateService";
import RoomUnavailable from "@/modules/mybar/ui/guest/RoomUnavailable";
import { RoomFrame } from "@/modules/mybar/ui/guest/RoomFrame";
import "../../guest.css";
import "../../mybar.css";
import { getGuestTarget, getRoomPageState } from "./guestTarget";
import Unavailable from "./unavailable";

export const dynamic = "force-dynamic";

export async function generateViewport({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Viewport> {
  const { token } = await params;
  const target = await getGuestTarget(token);
  const themeColor = target.kind === "TABLE" ? target.state.theme.bg : "#0f0d0a";
  return {
    width: "device-width",
    initialScale: 1,
    maximumScale: 5,
    viewportFit: "cover",
    themeColor,
  };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  const [target, t] = await Promise.all([getGuestTarget(token), getTranslations("guest.menu")]);
  // The browser tab follows the guest language like the page itself.
  const title = target.kind === "TABLE" ? `${target.state.outletName} · ${t("title")}` : t("title");

  return {
    title,
    robots: { index: false, follow: false },
    referrer: "no-referrer",
    formatDetection: {
      telephone: false,
    },
  };
}

export default async function GuestLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const [target, locale, messages] = await Promise.all([getGuestTarget(token), getLocale(), getMessages()]);
  const rtl = isRtl(locale as Locale);

  if (target.kind === "NONE") {
    return (
      <div className="g-root" dir={rtl ? "rtl" : "ltr"} lang={locale}>
        <HtmlLangSync locale={locale as Locale} />
        <Unavailable reason={target.reason} />
        {children /* renders nothing, but lets the page apply ?lang= */}
      </div>
    );
  }

  if (target.kind === "ROOM") {
    const room = await getRoomPageState(target.roomId, target.hotelId);
    if (room.reason) {
      return (
        <NextIntlClientProvider locale={locale} messages={messages}>
          <div className="g-root mb-root" dir={rtl ? "rtl" : "ltr"} lang={locale}>
            <HtmlLangSync locale={locale as Locale} />
            <RoomUnavailable reason={room.reason} />
          </div>
        </NextIntlClientProvider>
      );
    }
    // The room's own message is written in Turkish; it is shown in the guest's language when a translation exists.
    let info = room.guestMessage ?? "";
    if (info && locale !== "tr") {
      try {
        info = (await localizeTexts([info], locale as Locale)).get(info) ?? info;
      } catch {
        // translation is best effort: the original text is shown
      }
    }
    return (
      <NextIntlClientProvider locale={locale} messages={messages}>
        <RoomFrame
          token={token}
          locale={locale as Locale}
          hotelName={room.hotel.name}
          logoUrl={room.hotel.logoUrl}
          roomNumber={room.roomNumber}
          info={info}
          chooser={room.mybarOpen && room.roomServiceOpen}
        >
          {children}
        </RoomFrame>
      </NextIntlClientProvider>
    );
  }

  const { state, table } = target;
  const callWaiterPosition = state.design?.options?.callWaiterPosition ?? "STICKY_FOOTER";

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <GuestFrame
        token={token}
        locale={locale as Locale}
        theme={state.theme}
        design={state.design}
        outletName={state.outletName}
        hotelName={state.hotelName}
        hotelLogoUrl={state.hotelLogoUrl}
        tableLabel={table.label}
        headerCallWaiter={
          callWaiterPosition === "STICKY_HEADER" ? (
            <CallWaiterButton
              token={token}
              locale={locale as Locale}
              options={state.callOptions}
              customText={state.design?.options?.callWaiterText}
            />
          ) : undefined
        }
        footer={
          <GuestFooter
            token={token}
            locale={locale as Locale}
            orderingOpen={state.orderingOpen}
            pricesShown={state.pricesShown}
            currency={state.currency}
            callOptions={state.callOptions}
            callWaiterText={state.design?.options?.callWaiterText}
            callWaiterPosition={callWaiterPosition}
          />
        }
      >
        {children}
      </GuestFrame>
    </NextIntlClientProvider>
  );
}
