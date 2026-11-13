import type { ModuleKey } from "@/generated/prisma/client";

/**
 * Yetki ekranlarının alan grupları: masaüstündeki operasyon klasörleriyle aynı dil. Yalnız görünüm
 * içindir; yetki denetimi (src/lib/rbac.ts) ekran kodu ve modül anahtarıyla çalışmaya devam eder.
 */
export const PERMISSION_GROUPS = [
  { id: "oda-servisi", label: "Oda Servisi Operasyonları" },
  { id: "outlet", label: "QR Menü / Outlet Operasyonları" },
  { id: "minibar", label: "Minibar Operasyonları" },
  { id: "kullanici", label: "Kullanıcı Yönetimi" },
  { id: "radar", label: "Operasyon Radarı" },
  { id: "rapor", label: "Raporlar" },
  { id: "sistem", label: "Sistem Yönetimi" },
] as const;

export type PermissionGroupId = (typeof PERMISSION_GROUPS)[number]["id"];

const BY_MODULE: Partial<Record<ModuleKey, PermissionGroupId>> = {
  ROOM_SERVICE: "oda-servisi",
  QR_MENU: "outlet",
  QR_ORDER: "outlet",
  MINIBAR: "minibar",
};

/** Çekirdek (CORE) ekranların alanı; listede olmayan çekirdek ekran "Sistem Yönetimi"ne düşer. */
const CORE_BY_CODE: Record<string, PermissionGroupId> = {
  "CR-KUL": "kullanici",
  "CR-ONL": "kullanici",
  "CR-KOM": "radar",
  "CR-RAD": "radar",
  "CR-RAP": "rapor",
};

export function permissionGroupOf(screen: { code: string; moduleKey: ModuleKey }): PermissionGroupId {
  return BY_MODULE[screen.moduleKey] ?? CORE_BY_CODE[screen.code] ?? "sistem";
}

/** Ekranları alan sırasına göre gruplar; boş alan listeye girmez, alan içi sıra korunur. */
export function groupScreens<T extends { code: string; moduleKey: ModuleKey }>(
  screens: readonly T[],
): { id: PermissionGroupId; label: string; screens: T[] }[] {
  return PERMISSION_GROUPS.map((group) => ({
    id: group.id,
    label: group.label,
    screens: screens.filter((screen) => permissionGroupOf(screen) === group.id),
  })).filter((group) => group.screens.length > 0);
}
