import { describe, expect, it } from "vitest";
import { noConsumptionBlockedReason } from "@/modules/minibar/ui/roomCheckRules";

const room = (kind: "KONTROL_EDILDI" | "DND" | "SARFIYAT_YOK" | "BEKLIYOR", added: number[]) => ({
  badge: { kind },
  setups: [{ items: added.map((addedToday) => ({ addedToday })) }],
});

describe("noConsumptionBlockedReason", () => {
  it("serbest: bugün ürün eklenmemiş, Sarfiyat Yok yok (bekliyor veya DND)", () => {
    expect(noConsumptionBlockedReason(room("BEKLIYOR", [0, 0]))).toBeNull();
    expect(noConsumptionBlockedReason(room("DND", [0]))).toBeNull();
  });

  it("+N sonrası kilitli: bugün eklenen ürün varsa Sarfiyat Yok kaydedilemez", () => {
    expect(noConsumptionBlockedReason(room("KONTROL_EDILDI", [0, 1]))).toMatch(/ürün eklendi/);
  });

  it("aynı gün ikinci Sarfiyat Yok kilitli", () => {
    expect(noConsumptionBlockedReason(room("SARFIYAT_YOK", [0]))).toMatch(/zaten/);
  });
});
