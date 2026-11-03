import type { MybarRow } from "../../server/requests";

/** "7 dk", "1 sa 5 dk": how long a request has been waiting. */
export function formatWait(fromMs: number, nowMs: number): string {
  const min = Math.max(0, Math.floor((nowMs - fromMs) / 60_000));
  if (min < 1) return "Az önce";
  if (min < 60) return `${min} dk`;
  return `${Math.floor(min / 60)} sa ${min % 60} dk`;
}

export const STATUS_LABEL: Record<MybarRow["status"], string> = {
  BEKLEMEDE: "Bekliyor",
  TAMAMLANDI: "Tamamlandı",
  IPTAL: "İptal edildi",
};

export function rowStatusLabel(row: Pick<MybarRow, "status" | "seenAt">): string {
  if (row.status === "BEKLEMEDE") return row.seenAt ? "Görüldü" : "Bekliyor";
  return STATUS_LABEL[row.status];
}

/** Waiting rows first (unseen before seen, oldest first: the longest wait on top), then the rest newest first. */
export function orderRows<T extends Pick<MybarRow, "status" | "seenAt" | "createdAt">>(
  rows: readonly T[],
): { waiting: T[]; recent: T[] } {
  const at = (r: T) => new Date(r.createdAt).getTime();
  const waiting = rows
    .filter((r) => r.status === "BEKLEMEDE")
    .sort((a, b) => Number(Boolean(a.seenAt)) - Number(Boolean(b.seenAt)) || at(a) - at(b));
  const recent = rows.filter((r) => r.status !== "BEKLEMEDE").sort((a, b) => at(b) - at(a));
  return { waiting, recent };
}

export function itemsSummary(row: Pick<MybarRow, "items">): string {
  return row.items.length === 0 ? "Yalnız not" : row.items.map((i) => `${i.name} ×${i.requestedQty}`).join(", ");
}
