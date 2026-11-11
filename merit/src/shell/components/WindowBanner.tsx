"use client";

import { useMemo } from "react";
import type { AppDefinition } from "../registry";
import { getApps } from "../registry";
import { XpIcon } from "../icons";
import { APP_FOLDERS } from "../appFolders";
import { SCREEN_GUIDES } from "@/modules/core/screenGuide";
import { useWindowStore } from "../windowStore";
import type { HotelInfo } from "./HotelPicker";
import { Icon } from "@/components/icons/Icon";

export const FOLDER_METADATA: Record<string, { title: string; subtitle: string; icon: string }> = {
  outlet: {
    title: "Outlet Operasyonları",
    subtitle: "Outlet, Masa Tanımları, QR Menü Yönetimi ve Tasarım Stüdyosu",
    icon: "klasor",
  },
  "room-service": {
    title: "Oda Servisi Operasyonları",
    subtitle: "Oda Servisi Menüsü, Tasarım Stüdyosu, Sipariş Kayıtları ve SLA Raporları",
    icon: "servis",
  },
  minibar: {
    title: "Minibar Operasyonları",
    subtitle: "Kat Planı, Setup/Ürün Tanımları, Konsinye Stok ve Tüketim Raporları",
    icon: "minibar",
  },
  sistem: {
    title: "Sistem Yönetimi",
    subtitle: "Otel Tanımlamaları, Denetim Masası, Sistem Ayarları ve Audit Log",
    icon: "ayarlar",
  },
  kullanici: {
    title: "Kullanıcı Yönetimi",
    subtitle: "Personel Hesapları, Rol Tanımları, Yetki Matrisi ve Ekip Yönetimi",
    icon: "kullanicilar",
  },
  radar: {
    title: "Operasyon Radarı",
    subtitle: "Canlı Radar penceresi ve tam ekran Duvar Ekranı",
    icon: "radar",
  },
  reports: {
    title: "Raporlar",
    subtitle: "F&B, Minibar ve Oda Servisi Operasyonel Performans ve Gelir Raporları",
    icon: "rapor",
  },
};

export const CATEGORY_TO_FOLDER: Record<string, string> = {
  OUTLET: "outlet",
  QR_MENU: "outlet",
  QR_ORDER: "outlet",
  ROOM_SERVICE: "room-service",
  MINIBAR: "minibar",
  SISTEM: "sistem",
  KULLANICI: "kullanici",
  RADAR: "radar",
  RAPOR: "reports",
  GENEL: "sistem",
};

export type WindowBannerProps = {
  windowId: string;
  app: AppDefinition;
  hotelId?: string;
  hotels: HotelInfo[];
  pickableHotels?: HotelInfo[];
  /** The app cannot run across hotels: the selector offers hotels only. */
  requireHotel?: boolean;
  onHotelChange: (hotelId: string) => void;
};

/**
 * Standardized Windows XP / Merit OS Module Header Banner.
 * Shows top blue gradient band with Icon, Title, Subtitle, centered Hotel Selector dropdown,
 * right badge, and breadcrumb navigation.
 */
export function WindowBanner({
  windowId,
  app,
  hotelId,
  hotels,
  pickableHotels,
  requireHotel,
  onHotelChange,
}: WindowBannerProps) {
  const isFolder = app.id.startsWith("folder.");
  const folderKey = isFolder
    ? app.id.replace("folder.", "")
    : CATEGORY_TO_FOLDER[app.category] ?? "sistem";

  const folderMeta = FOLDER_METADATA[folderKey];
  const parentFolderTitle = folderMeta?.title ?? "Operasyonlar";

  let title = app.launchLabel ?? app.title;
  let subtitle = SCREEN_GUIDES[app.screenCode]?.purpose ?? "";

  if (isFolder && folderMeta) {
    title = folderMeta.title;
    subtitle = folderMeta.subtitle;
  } else if (!subtitle) {
    subtitle = folderMeta?.subtitle ?? app.title;
  }

  // Filter apps for folder count
  const allowedIds = useWindowStore((s) => s.appIds);
  const allApps = useMemo(() => getApps(), []);

  const folderAppsCount = useMemo(() => {
    if (!isFolder) return 0;
    const folder = APP_FOLDERS.find(({ id }) => id === folderKey);
    return allApps.filter(
      (a) =>
        folder?.categories.includes(a.category) &&
        !a.id.startsWith("folder.") &&
        (!allowedIds || allowedIds.includes(a.id)),
    ).length;
  }, [isFolder, folderKey, allApps, allowedIds]);

  const badgeText = isFolder ? `${folderAppsCount} Uygulama` : parentFolderTitle;

  const hotelList = pickableHotels && pickableHotels.length > 0 ? pickableHotels : hotels;

  return (
    <div className="flex flex-col flex-none select-none border-b border-[#003c9a]/30">
      {/* Windows XP Classic Blue Header Banner */}
      <div className="bg-gradient-to-r from-[#0055ea] via-[#2070f0] to-[#0055ea] text-white px-3 py-2 flex items-center justify-between shadow-inner min-h-[44px]">
        {/* Left: Icon, Title, Subtitle */}
        <div className="flex items-center gap-2.5 min-w-0 pr-2">
          <div className="shrink-0 drop-shadow-sm">
            <XpIcon name={app.icon} size={24} />
          </div>
          <div className="min-w-0">
            <h2 className="font-bold text-sm tracking-wide text-white drop-shadow-sm truncate leading-tight">
              {title}
            </h2>
            <p className="text-[11px] text-blue-100 opacity-90 truncate leading-tight">
              {subtitle}
            </p>
          </div>
        </div>

        {/* Center: Otel Seçimi Select (Theme-compliant XP style) */}
        <div className="flex items-center gap-1.5 px-3 py-1 bg-black/20 hover:bg-black/30 rounded-md border border-white/20 shadow-xs transition-colors shrink-0 mx-2">
          <label
            htmlFor={`xp-hotel-select-${windowId}`}
            className="text-[11px] font-bold text-yellow-300 drop-shadow-xs flex items-center gap-1 whitespace-nowrap cursor-pointer select-none"
          >
            <Icon name="building" size={12} />
            <span>Otel:</span>
          </label>
          <select
            id={`xp-hotel-select-${windowId}`}
            value={hotelId ?? ""}
            onChange={(e) => onHotelChange(e.target.value)}
            aria-label="Otel Seçimi"
            className="bg-white text-[#003399] font-bold text-xs px-2.5 py-0.5 rounded shadow-inner border border-[#003c9a] cursor-pointer hover:border-blue-700 focus:outline-none focus:ring-2 focus:ring-yellow-400 max-w-[210px] truncate"
          >
            {requireHotel && hotelId ? null : <option value="">Tüm Oteller (Konsolide)</option>}
            {hotelList.map((h) => (
              <option key={h.id} value={h.id}>
                {h.name}
              </option>
            ))}
          </select>
        </div>

        {/* Right: Badge */}
        <div className="shrink-0 pl-2">
          <span className="text-[11px] bg-white/20 hover:bg-white/25 border border-white/30 text-white px-2.5 py-0.5 rounded-full font-semibold shadow-xs">
            {badgeText}
          </span>
        </div>
      </div>

      {/* Explorer Path Breadcrumb Bar */}
      <div className="bg-[#f0ede0] border-b border-[#d4d0c8] px-3 py-1 text-[11px] text-gray-600 flex items-center gap-1.5 overflow-hidden whitespace-nowrap flex-none">
        <span className="text-gray-600">Konum:</span>
        <span className="font-semibold text-gray-700">Masaüstü</span>
        <span className="text-gray-600">›</span>
        {isFolder ? (
          <span className="font-bold text-blue-800">{title}</span>
        ) : (
          <>
            <span className="font-semibold text-gray-700">{parentFolderTitle}</span>
            <span className="text-gray-600">›</span>
            <span className="font-bold text-blue-800 truncate">{title}</span>
          </>
        )}
      </div>
    </div>
  );
}
