/** Today's state of a room on the room check screen (the `badge` of the room check view). */
export type RoomBadgeKind = "KONTROL_EDILDI" | "DND" | "SARFIYAT_YOK" | "BEKLIYOR";

/**
 * Why "Sarfiyat Yok" cannot be recorded now (null = it can). A product added today means there was consumption:
 * the two records contradict each other, so the button locks until the addition is undone. The server enforces
 * the same rule (`recordNoConsumption`), this only keeps the button honest.
 */
export function noConsumptionBlockedReason(data: {
  badge: { kind: RoomBadgeKind };
  setups: { items: { addedToday: number }[] }[];
}): string | null {
  if (data.badge.kind === "SARFIYAT_YOK") return "Bu oda bugün zaten Sarfiyat Yok olarak kaydedildi.";
  const added = data.setups.some((s) => s.items.some((i) => i.addedToday > 0));
  if (added) return "Bugün bu odaya ürün eklendi; Sarfiyat Yok kaydedilemez. Eklemeyi geri alırsanız tekrar açılır.";
  return null;
}
