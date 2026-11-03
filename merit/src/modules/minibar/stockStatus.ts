export type StockStatus = "STOKOUT" | "KRITIK" | "DIKKAT" | "NORMAL";
export type StockUrgency = "ACIL" | "NORMAL";

/** 0 -> STOKOUT; <= critical -> KRITIK; <= critical x 1.5 -> DIKKAT; otherwise NORMAL. */
export function stockStatus(remaining: number, critical: number): StockStatus {
  if (remaining <= 0) return "STOKOUT";
  if (remaining <= critical) return "KRITIK";
  if (remaining <= critical * 1.5) return "DIKKAT";
  return "NORMAL";
}

/** How many units to ask for so the pool reaches `critical x factor`. */
export function suggestQty(remaining: number, critical: number, factor: number): number {
  return Math.max(0, Math.ceil(critical * factor - remaining));
}

export function urgencyFor(status: StockStatus): StockUrgency {
  return status === "STOKOUT" || status === "KRITIK" ? "ACIL" : "NORMAL";
}

/** Worst first. */
export const STATUS_RANK: Record<StockStatus, number> = { STOKOUT: 0, KRITIK: 1, DIKKAT: 2, NORMAL: 3 };
