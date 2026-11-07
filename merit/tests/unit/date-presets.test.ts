import { describe, expect, it } from "vitest";
import { presetRange } from "@/modules/reporting/ui/datePresets";

// 2026-10-31 22:30 UTC = 1 Kasım 00:30 Nicosia (UTC+2): Nicosia gününe göre sayılır.
const NOV1 = new Date("2026-10-31T22:30:00Z");

describe("presetRange — Nicosia iş günü", () => {
  it("bugün, dün, hafta, ay, son 7/30 gün", () => {
    expect(presetRange("bugun", NOV1)).toEqual({ from: "2026-11-01", to: "2026-11-01" });
    expect(presetRange("dun", NOV1)).toEqual({ from: "2026-10-31", to: "2026-10-31" });
    expect(presetRange("son7", NOV1)).toEqual({ from: "2026-10-26", to: "2026-11-01" });
    expect(presetRange("son30", NOV1)).toEqual({ from: "2026-10-03", to: "2026-11-01" });
    expect(presetRange("buAy", NOV1)).toEqual({ from: "2026-11-01", to: "2026-11-01" });
    expect(presetRange("gecenAy", NOV1)).toEqual({ from: "2026-10-01", to: "2026-10-31" });
  });

  it("bu hafta Pazartesi'den başlar (1 Kasım 2026 Pazar → 26 Ekim)", () => {
    expect(presetRange("buHafta", NOV1)).toEqual({ from: "2026-10-26", to: "2026-11-01" });
    expect(presetRange("buHafta", new Date("2026-11-04T09:00:00Z"))).toEqual({ from: "2026-11-02", to: "2026-11-04" });
  });

  it("yıl başı: geçen ay Aralık, dün 31 Aralık", () => {
    const jan1 = new Date("2026-12-31T22:10:00Z");
    expect(presetRange("gecenAy", jan1)).toEqual({ from: "2026-12-01", to: "2026-12-31" });
    expect(presetRange("dun", jan1)).toEqual({ from: "2026-12-31", to: "2026-12-31" });
    expect(presetRange("son7", jan1)).toEqual({ from: "2026-12-26", to: "2027-01-01" });
  });

  it("UTC'de hâlâ dünse bile Nicosia günü esas alınır (yaz saati UTC+3)", () => {
    expect(presetRange("bugun", new Date("2026-06-30T21:30:00Z")).to).toBe("2026-07-01");
  });
});
