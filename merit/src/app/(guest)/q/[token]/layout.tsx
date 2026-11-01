import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { isRtl, type Locale } from "@/lib/i18n/locales";
import { GuestFooter } from "@/modules/menu/ui/guest/GuestFooter";
import { GuestFrame, HtmlLangSync } from "@/modules/menu/ui/guest/GuestFrame";
import RoomPlaceholder from "@/modules/menu/ui/guest/RoomPlaceholder";
import "../../guest.css";
import { getGuestTarget } from "./guestTarget";
import Unavailable from "./unavailable";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Menü",
  robots: { index: false, follow: false },
  // The URL carries the table token: do not leak it through the Referer header.
  referrer: "no-referrer",
};

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
    const t = await getTranslations("guest");
    return (
      <div className="g-root" dir={rtl ? "rtl" : "ltr"} lang={locale}>
        <HtmlLangSync locale={locale as Locale} />
        <RoomPlaceholder message={t("room.placeholder")} />
        {children /* renders nothing, but lets the page apply ?lang= */}
      </div>
    );
  }

  const { state, table } = target;
  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <GuestFrame
        token={token}
        locale={locale as Locale}
        theme={state.theme}
        design={state.design}
        outletName={state.outletName}
        tableLabel={table.label}
        footer={
          <GuestFooter
            token={token}
            locale={locale as Locale}
            orderingOpen={state.orderingOpen}
            pricesShown={state.pricesShown}
            currency={state.currency}
            callOptions={state.callOptions}
            callWaiterText={state.design?.options?.callWaiterText}
          />
        }
      >
        {children}
      </GuestFrame>
    </NextIntlClientProvider>
  );
}
