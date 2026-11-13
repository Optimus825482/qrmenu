import type { MybarRow, MybarStage } from "../../server/requests";

/** Stage tabs of the request pages, in the order the work flows. */
export const STAGE_TABS: readonly { stage: MybarStage; label: string; empty: string }[] = [
  { stage: "ONAY_BEKLIYOR", label: "Onay bekleyen", empty: "Onay bekleyen MyBar talebi yok." },
  { stage: "ONAYLANDI", label: "Onaylanan", empty: "Onaylanıp tamamlanmayı bekleyen talep yok." },
  { stage: "TAMAMLANDI", label: "Tamamlanan", empty: "Son 7 günde tamamlanan talep yok." },
  { stage: "IPTAL", label: "İptal", empty: "Son 7 günde iptal edilen talep yok." },
];

/** Same rule as the server `mybarStage`; kept here so client bundles do not import the server module. */
export function stageOf(row: { status: MybarRow["status"]; seenAt: Date | string | null }): MybarStage {
  if (row.status === "BEKLEMEDE") return row.seenAt ? "ONAYLANDI" : "ONAY_BEKLIYOR";
  return row.status;
}

type Dated = Date | string | null;

/** Rows of one stage: open stages oldest first (longest wait on top), closed stages newest first. */
export function rowsOfStage<
  T extends { status: MybarRow["status"]; seenAt: Dated; createdAt: Date | string; completedAt: Dated; cancelledAt: Dated },
>(rows: readonly T[], stage: MybarStage): T[] {
  const ms = (d: Dated) => (d ? new Date(d).getTime() : 0);
  const list = rows.filter((r) => stageOf(r) === stage);
  if (stage === "ONAY_BEKLIYOR" || stage === "ONAYLANDI") return list.sort((a, b) => ms(a.createdAt) - ms(b.createdAt));
  const closedAt = (r: T) => ms(r.completedAt ?? r.cancelledAt ?? r.createdAt);
  return list.sort((a, b) => closedAt(b) - closedAt(a));
}

/** "7 dk", "1 sa 5 dk": how long a request has been waiting. */
export function formatWait(fromMs: number, nowMs: number): string {
  const min = Math.max(0, Math.floor((nowMs - fromMs) / 60_000));
  if (min < 1) return "Az önce";
  if (min < 60) return `${min} dk`;
  return `${Math.floor(min / 60)} sa ${min % 60} dk`;
}

export const STATUS_LABEL: Record<MybarRow["status"], string> = {
  BEKLEMEDE: "Onay bekliyor",
  TAMAMLANDI: "Tamamlandı",
  IPTAL: "İptal edildi",
};

export function rowStatusLabel(row: Pick<MybarRow, "status" | "seenAt">): string {
  if (row.status === "BEKLEMEDE") return row.seenAt ? "Onaylandı" : "Onay bekliyor";
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

export function itemsSummary(row: Pick<MybarRow, "items" | "removals">): string {
  if (row.items.length > 0) return row.items.map((i) => `${i.name} ×${i.requestedQty}`).join(", ");
  if (row.removals.length > 0) return row.removals.map((i) => `${i.name} ×${i.requestedQty}`).join(", ");
  return "Yalnız not";
}

/** "6 çıkarılacak · 6 eklenecek": what the swap asks for, in pieces (empty when no products were asked). */
export function swapSummary(row: Pick<MybarRow, "items" | "removals">): string {
  const out = row.removals.reduce((sum, i) => sum + i.requestedQty, 0);
  const add = row.items.reduce((sum, i) => sum + i.requestedQty, 0);
  const parts: string[] = [];
  if (out > 0) parts.push(`${out} çıkarılacak`);
  if (add > 0) parts.push(`${add} eklenecek`);
  return parts.join(" · ");
}
