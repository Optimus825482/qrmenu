import type { Metadata, Viewport } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import type { ReactNode } from "react";
import { isRtl, type Locale } from "@/lib/i18n/locales";
import { GuestFooter } from "@/modules/menu/ui/guest/GuestFooter";
import { GuestFrame, HtmlLangSync } from "@/modules/menu/ui/guest/GuestFrame";
import { MybarGuestScreen } from "@/modules/minibar/ui/guest/MybarGuestScreen";
import "../../guest.css";
import { getGuestTarget } from "./guestTarget";
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
  const target = await getGuestTarget(token);
  const title =
    target.kind === "TABLE"
      ? `${target.state.outletName} · Menü`
      : "Menü";
  const appTitle =
    target.kind === "TABLE"
      ? `${target.state.outletName} Menü`
      : "Merit Menü";

  return {
    title,
    robots: { index: false, follow: false },
    referrer: "no-referrer",
    manifest: `/api/manifest/guest/${encodeURIComponent(token)}`,
    appleWebApp: {
      capable: true,
      title: appTitle,
      statusBarStyle: "black-translucent",
    },
    formatDetection: {
      telephone: false,
    },
    other: {
      "mobile-web-app-capable": "yes",
      "apple-mobile-web-app-capable": "yes",
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
    return (
      <div className="g-root" dir={rtl ? "rtl" : "ltr"} lang={locale}>
        <HtmlLangSync locale={locale as Locale} />
        <MybarGuestScreen token={token} />
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
