import { notFound, redirect } from "next/navigation";
import { NextIntlClientProvider } from "next-intl";
import { isLocale, type Locale } from "@/lib/i18n/locales";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { currentUser } from "@/app/(admin)/admin/guard";
import { assertOutletScope } from "@/modules/menu/server/menuNodeAccess";
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

  // Staff-only preview: session + QM-MEN view right within the outlet's hotel and outlet scope.
  const ctx = await currentUser();
  if (!ctx) redirect(`/giris?next=${encodeURIComponent(`/q/onizleme/${outletId}`)}`);

  const outlet = await prisma.outlet.findUnique({
    where: { id: outletId },
    select: { id: true, name: true, isActive: true, hotelId: true },
  });

  if (!outlet) {
    notFound();
  }

  let permitted = ctx.hotelIds.includes(outlet.hotelId) && (await can(ctx, "QM-MEN", "V", outlet.hotelId));
  if (permitted) {
    try {
      assertOutletScope(ctx, outlet.id);
    } catch {
      permitted = false;
    }
  }
  if (!permitted) redirect("/yetkisiz?ekran=QM-MEN");

  const locale: Locale = typeof lang === "string" && isLocale(lang) ? lang : "tr";
  const state = await guestState(outlet.id);
  const menu = await getMenu(outlet.id, locale);

  let activeTheme = state.theme;
  // Themes are a global catalogue (MenuTheme has no hotel link): only an existing theme id is accepted.
  if (typeof themeId === "string" && themeId.length > 0 && themeId.length <= 64) {
    const overrideTheme = await prisma.menuTheme.findUnique({
      where: { id: themeId },
      select: { bg: true, accent: true, soft: true, textOnAccent: true },
    });
    if (overrideTheme) {
      activeTheme = overrideTheme;
    }
  }

  return (
    <NextIntlClientProvider locale={locale} messages={MESSAGES[locale]}>
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
