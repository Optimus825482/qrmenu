import type { AppCategory } from "./registry";

export const APP_FOLDERS: { id: string; label: string; categories: AppCategory[] }[] = [
  { id: "outlet", label: "Outlet", categories: ["OUTLET", "QR_MENU", "QR_ORDER"] },
  { id: "room-service", label: "Oda Servisi", categories: ["ROOM_SERVICE"] },
  { id: "minibar", label: "Minibar", categories: ["MINIBAR"] },
  { id: "radar", label: "Operasyon Radarı", categories: ["RADAR"] },
  { id: "reports", label: "Raporlar", categories: ["RAPOR"] },
  { id: "sistem", label: "Sistem", categories: ["SISTEM", "GENEL"] },
  { id: "kullanici", label: "Kullanıcı", categories: ["KULLANICI"] },
];

/** The programs inside an operation folder app (`folder.<id>`): every non-folder app of its categories. */
export function appsOfFolder<T extends { id: string; category: AppCategory }>(folderAppId: string, apps: readonly T[]): T[] {
  const folder = APP_FOLDERS.find(({ id }) => `folder.${id}` === folderAppId);
  return folder ? apps.filter((a) => !a.id.startsWith("folder.") && folder.categories.includes(a.category)) : [];
}
