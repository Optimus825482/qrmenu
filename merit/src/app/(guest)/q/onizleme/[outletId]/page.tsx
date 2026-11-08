import { notFound } from "next/navigation";
import { NextIntlClientProvider } from "next-intl";
import { isLocale, type Locale } from "@/lib/i18n/locales";
import { prisma } from "@/lib/prisma";
import { getMenu } from "@/modules/menu/server/guestMenu";
import { guestState } from "@/modules/menu/server/guestState";
import { GuestFrame } from "@/modules/menu/ui/guest/GuestFrame";
import { MenuView } from "@/modules/menu/ui/guest/MenuView";
import tr from "@/lib/i18n/messages/tr.json";
import en from "@/lib/i18n/messages/en.json";
import de from "@/lib/i18n/messages/de.json";
import ru from "@/lib/i18n/messages/ru.json";
import ar from "@/lib/i18n/messages/ar.json";
import fr from "@/lib/i18n/messages/fr.json";
import el from "@/lib/i18n/messages/el.json";
import it from "@/lib/i18n/messages/it.json";
import "../../../guest.css";

export const dynamic = "force-dynamic";

const MESSAGES: Record<Locale, Record<string, unknown>> = {
  tr,
  en,
  de,
  ru,
  ar,
  fr,
  el,
  it,
};

export default async function OutletMenuPreviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ outletId: string }>;
  searchParams: Promise<{ theme?: string; lang?: string }>;
}) {
  const { outletId } = await params;
  const { theme: themeId, lang } = await searchParams;

  const outlet = await prisma.outlet.findUnique({
    where: { id: outletId },
    select: { id: true, name: true, isActive: true },
  });

  if (!outlet) {
    notFound();
  }

  const locale: Locale = typeof lang === "string" && isLocale(lang) ? lang : "tr";
  const state = await guestState(outlet.id);
  const menu = await getMenu(outlet.id, locale);

  let activeTheme = state.theme;
  if (themeId) {
    const overrideTheme = await prisma.menuTheme.findUnique({
      where: { id: themeId },
      select: { bg: true, accent: true, soft: true, textOnAccent: true },
    });
    if (overrideTheme) {
      activeTheme = overrideTheme;
    }
  }

  const firstTable = await prisma.outletTable.findFirst({
    where: { outletId: outlet.id, isActive: true },
    select: { qrToken: true, label: true },
  });

  return (
    <NextIntlClientProvider locale={locale} messages={MESSAGES[locale]}>
      {firstTable ? (
        <aside
          style={{
            position: "fixed",
            bottom: 12,
            right: 12,
            zIndex: 9999,
            background: "#0f172a",
            color: "#f8fafc",
            padding: "8px 14px",
            borderRadius: "10px",
            fontSize: "12px",
            boxShadow: "0 4px 14px rgba(0,0,0,0.4)",
            display: "flex",
            alignItems: "center",
            gap: "10px",
          }}
        >
          <span>Canlı Masa QR: <strong>{firstTable.label}</strong></span>
          <a
            href={`/q/${firstTable.qrToken}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              background: "#2563eb",
              color: "#ffffff",
              padding: "4px 8px",
              borderRadius: "6px",
              textDecoration: "none",
              fontWeight: 600,
            }}
          >
            Masa Bağlantısını Aç ↗
          </a>
        </aside>
      ) : null}
      <GuestFrame
        token="onizleme"
        locale={locale}
        theme={activeTheme}
        design={state.design}
        outletName={outlet.name}
        placeLabel="Önizleme Modu"
        preview
      >
        <MenuView menu={menu} locale={locale} />
      </GuestFrame>
    </NextIntlClientProvider>
  );
}
