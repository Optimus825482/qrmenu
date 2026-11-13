/**
 * Which screens open the operational counters of the Komuta Merkezi "Canlı Komuta Radarı" cards and the
 * "Anlık Durum" widget. The online-user numbers belong to Komuta Merkezi itself; the others summarise another
 * area's data, so a user sees them only when they may view one of that area's screens.
 */
export type KpiCell = "doluluk" | "mybar" | "geciken" | "kasa";

export const KPI_CELL_SCREENS: Record<KpiCell, readonly string[]> = {
  doluluk: ["CR-RAD", "MB-DOL"],
  mybar: ["MB-PERS"],
  geciken: ["RO-SLA", "RO-TAL"],
  kasa: ["QS-KAS", "QS-KUY"],
};

/** `screens` = screen codes the user may view (null: no per-hotel limit is known, everything shows). */
export function kpiCellVisible(cell: KpiCell, screens: ReadonlySet<string> | null): boolean {
  return screens === null || KPI_CELL_SCREENS[cell].some((code) => screens.has(code));
}

/** Screen codes viewable in `hotelId`, or in any hotel of the user without it. */
export function viewableScreens(screensByHotel: Record<string, string[]> | null, hotelId?: string): Set<string> | null {
  if (screensByHotel === null) return null;
  return new Set(hotelId ? (screensByHotel[hotelId] ?? []) : Object.values(screensByHotel).flat());
}
