"use client";

import type { AppProps } from "@/shell/registry";
import { getApps } from "@/shell/registry";
import { appVisibleInHotel, useWindowStore } from "@/shell/windowStore";
import { XpIcon } from "@/shell/icons";
import { APP_FOLDERS } from "@/shell/appFolders";
import { SCREEN_GUIDES } from "@/modules/core/screenGuide";

interface CategoryFolderAppProps extends AppProps {
  categoryKey: string;
  categoryTitle: string;
  categorySubtitle: string;
}

export function CategoryFolderWindow({
  categoryKey,
  categoryTitle,
  categorySubtitle,
  hotelId,
  openApp,
}: CategoryFolderAppProps) {
  const allowedIds = useWindowStore((s) => s.appIds);
  const hotels = useWindowStore((s) => s.hotels);
  const screensByHotel = useWindowStore((s) => s.screensByHotel);
  const allApps = getApps();
  const folder = APP_FOLDERS.find(({ id }) => id === categoryKey);
  // Filter apps belonging to this category, EXCLUDING the folder itself (id starting with "folder.")
  // and checking allowed permissions for the active user. A folder window bound to a hotel lists only
  // what that hotel allows (a hotel-bound program the hotel's permissions do not open would not start).
  const folderApps = allApps.filter(
    (a) =>
      folder?.categories.includes(a.category) &&
      !a.id.startsWith("folder.") &&
      (!allowedIds || allowedIds.includes(a.id)) &&
      (!hotelId || !a.needsHotel || appVisibleInHotel({ hotels, screensByHotel }, a, hotelId)),
  );

  return (
    <div className="flex flex-col h-full bg-[#ece9d8] text-xs font-sans select-none overflow-hidden">
      {/* Folder Content Grid */}
      <div className="flex-1 bg-white p-5 overflow-auto">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {folderApps.map((app) => (
            <button
              key={app.id}
              type="button"
              onClick={() => openApp?.(app.id, { hotelId: hotelId || undefined })}
              className="group flex flex-col items-center justify-center p-3.5 rounded-lg border border-transparent hover:border-[#7f9db9] hover:bg-[#eef4fc] active:bg-[#dbe9fa] transition-all cursor-pointer text-center"
            >
              <div className="w-16 h-16 flex items-center justify-center rounded-xl bg-gradient-to-b from-white to-[#f4f7fb] border border-slate-200/90 shadow-[0_4px_10px_rgba(0,0,0,0.07),inset_0_1px_0_rgba(255,255,255,1)] group-hover:border-blue-400 group-hover:from-blue-50/60 group-hover:to-white group-hover:shadow-[0_8px_18px_rgba(59,130,246,0.22),inset_0_1px_0_rgba(255,255,255,1)] group-hover:-translate-y-1 group-active:translate-y-0.5 transition-all duration-150 mb-2">
                <XpIcon name={app.icon} size={38} />
              </div>
              <span className="font-semibold text-xs text-gray-800 group-hover:text-blue-900 leading-tight max-w-[130px] line-clamp-2 drop-shadow-sm">
                {app.launchLabel ?? app.title}
              </span>
              <span className="text-[10px] text-gray-600 mt-1 font-medium">
                {app.purpose ?? SCREEN_GUIDES[app.screenCode]?.purpose}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Status Bar */}
      <div className="bg-[#ece9d8] border-t border-[#d4d0c8] px-3 py-1 text-[11px] text-gray-600 flex justify-between">
        <span>Toplam {folderApps.length} nesne</span>
        <span>F&amp;B Command Center</span>
      </div>
    </div>
  );
}

// 5 Dedicated Folder Components
export function OutletFolderWindow(props: AppProps) {
  return (
    <CategoryFolderWindow
      {...props}
      categoryKey="outlet"
      categoryTitle="Outlet Operasyonları"
      categorySubtitle="Outlet, Masa Tanımları, QR Menü Yönetimi ve Tasarım Stüdyosu"
    />
  );
}

export function RoomServiceFolderWindow(props: AppProps) {
  return (
    <CategoryFolderWindow
      {...props}
      categoryKey="room-service"
      categoryTitle="Oda Servisi Operasyonları"
      categorySubtitle="Oda Servisi Menüsü, Tasarım Stüdyosu, Sipariş Kayıtları ve SLA Raporları"
    />
  );
}

export function MinibarFolderWindow(props: AppProps) {
  return (
    <CategoryFolderWindow
      {...props}
      categoryKey="minibar"
      categoryTitle="Minibar Operasyonları"
      categorySubtitle="Kat Planı, Setup/Ürün Tanımları, Konsinye Stok ve Tüketim Raporları"
    />
  );
}

export function SistemFolderWindow(props: AppProps) {
  return (
    <CategoryFolderWindow
      {...props}
      categoryKey="sistem"
      categoryTitle="Sistem Yönetimi"
      categorySubtitle="Otel Tanımlamaları, Denetim Masası, Sistem Ayarları ve Audit Log"
    />
  );
}

export function KullaniciFolderWindow(props: AppProps) {
  return (
    <CategoryFolderWindow
      {...props}
      categoryKey="kullanici"
      categoryTitle="Kullanıcı Yönetimi"
      categorySubtitle="Personel Hesapları, Rol Tanımları, Yetki Matrisi ve Ekip Yönetimi"
    />
  );
}

export function RadarFolderWindow(props: AppProps) {
  return (
    <CategoryFolderWindow
      {...props}
      categoryKey="radar"
      categoryTitle="Operasyon Radarı"
      categorySubtitle="Canlı Radar penceresi ve tam ekran Duvar Ekranı"
    />
  );
}

export function ReportsFolderWindow(props: AppProps) {
  return (
    <CategoryFolderWindow
      {...props}
      categoryKey="reports"
      categoryTitle="Raporlar"
      categorySubtitle="F&B, Minibar ve Oda Servisi Operasyonel Performans ve Gelir Raporları"
    />
  );
}
