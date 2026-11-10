"use client";

import { useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { useSelectedLayoutSegment } from "next/navigation";
import { Icon } from "@/components/icons/Icon";
import { isRtl, type Locale } from "@/lib/i18n/locales";
import { HtmlLangSync } from "@/modules/menu/ui/guest/GuestFrame";
import { RoomLanguageSwitch } from "./RoomLanguageSwitch";

/** Hotel logo; the hotel name replaces it when no logo is set or the image cannot be loaded. */
function HotelMark({ name, logoUrl }: { name: string; logoUrl: string | null }) {
  const [failed, setFailed] = useState(false);
  if (logoUrl && !failed) {
    // eslint-disable-next-line @next/next/no-img-element -- hotel logos are admin-uploaded files of arbitrary origin
    return <img className="mb-logo" src={logoUrl} alt={name} onError={() => setFailed(true)} />;
  }
  return <p className="mb-hotel-name">{name}</p>;
}

/**
 * Frame of the room QR pages (live template layout): language menu, hotel logo, room badge, title and
 * the information box (the room's own guest message, else the default sentence).
 * On the service chooser (`/q/{token}` of a room with both MyBar and room service open) the title and the
 * default sentence are neutral, and the room service pages carry the room service title: the MyBar wording
 * only belongs to the MyBar page.
 */
export function RoomFrame({
  token,
  locale,
  hotelName,
  logoUrl,
  roomNumber,
  info,
  chooser = false,
  children,
}: {
  token: string;
  locale: Locale;
  hotelName: string;
  logoUrl: string | null;
  roomNumber: string;
  /** Already localised guest message; empty falls back to the default sentence. */
  info: string;
  /** Both services are open, so the room's home page is the two-card chooser. */
  chooser?: boolean;
  children: ReactNode;
}) {
  const t = useTranslations("mybar");
  // `null` = the layout's own page (`/q/{token}`); "mybar" / "oda-servisi" are the service pages.
  const tGuest = useTranslations("guest");
  const segment = useSelectedLayoutSegment();
  const onChooser = chooser && segment === null;
  // The room service menu and its order page are not MyBar: they carry their own title and no MyBar sentence.
  const onRoomService = segment === "oda-servisi" || segment === "siparis";
  const title = onChooser
    ? t("chooser.heading")
    : onRoomService
      ? tGuest("rs.menu.title").toLocaleUpperCase(locale)
      : t("title");
  const fallbackInfo = onChooser
    ? t("chooser.subtitle", { hotel: hotelName })
    : onRoomService
      ? ""
      : t("subtitle", { hotel: hotelName });
  const infoText = info || fallbackInfo;
  return (
    <div className="g-root mb-root" dir={isRtl(locale) ? "rtl" : "ltr"} lang={locale} data-room-frame>
      <HtmlLangSync locale={locale} token={token} />
      <div className="mb-shell">
        <div className="mb-card">
          <div className="mb-lang">
            <RoomLanguageSwitch token={token} locale={locale} />
          </div>
          <header className="mb-header">
            <HotelMark name={hotelName} logoUrl={logoUrl} />
            <span className="mb-room-badge">
              <Icon name="concierge" size={20} />
              <span>
                {t("room")} {roomNumber}
              </span>
            </span>
            <h1 className="mb-title">{title}</h1>
            {infoText ? <p className="mb-info">{infoText}</p> : null}
          </header>
          <main className="mb-body">{children}</main>
        </div>
      </div>
    </div>
  );
}
