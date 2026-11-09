import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { contrastRatio } from "@/lib/contrast";
import { TONES, orderTone, tableTone, type StatusTone } from "@/components/ui/statusTone";

const css = readFileSync(path.resolve(__dirname, "../../src/app/globals.css"), "utf8");
const token = (expr: string): string => {
  const name = expr.match(/var\((--[a-z-]+)\)/)![1];
  const m = css.match(new RegExp(String.raw`(?:^|[\s;{])` + name + String.raw`:\s*(#[0-9a-fA-F]{3,6})\s*;`));
  if (!m) throw new Error(`token ${name} not found`);
  return m[1];
};

describe("orderTone", () => {
  it("eşler", () => {
    expect(orderTone("HAZIR")).toBe("ready");
    expect(orderTone("GONDERILDI")).toBe("pending");
    expect(orderTone("TEYIT_BEKLIYOR")).toBe("pending");
    expect(orderTone("ONAYLANDI")).toBe("preparing");
    expect(orderTone("YOLDA")).toBe("preparing");
    expect(orderTone("SERVIS_EDILDI")).toBe("done");
    expect(orderTone("TESLIM_EDILDI")).toBe("done");
    expect(orderTone("REDDEDILDI")).toBe("cancelled");
    expect(orderTone("IPTAL")).toBe("cancelled");
  });
});

describe("tableTone", () => {
  it("2 gönderildi + 1 hazır: onay bekliyor önce gelir", () => {
    const r = tableTone({ openOrders: [{ status: "GONDERILDI" }, { status: "GONDERILDI" }, { status: "HAZIR" }], openCalls: 0, scannedRecently: false });
    expect(r.tone).toBe("pending");
    expect(r.label).toBe("Onay bekliyor · 2");
  });
  it("öncelik: hazır > hazırlanıyor > dolu", () => {
    expect(tableTone({ openOrders: [{ status: "ONAYLANDI" }, { status: "HAZIR" }], openCalls: 0, scannedRecently: true }).label).toBe("Hazır");
    expect(tableTone({ openOrders: [{ status: "ONAYLANDI" }], openCalls: 0, scannedRecently: true }).label).toBe("Hazırlanıyor");
    expect(tableTone({ openOrders: [], openCalls: 0, scannedRecently: true }).label).toBe("Dolu");
  });
  it("çağrı rozeti ve 60 sn eşiği", () => {
    const a = tableTone({ openOrders: [], openCalls: 1, oldestCallAgeSec: 45, scannedRecently: false });
    expect(a.callBadge).toBe(true);
    expect(a.callOverdue).toBe(false);
    expect(tableTone({ openOrders: [], openCalls: 1, oldestCallAgeSec: 60, scannedRecently: false }).callOverdue).toBe(true);
  });
  it("boş masa", () => {
    expect(tableTone({ openOrders: [], openCalls: 0, scannedRecently: false })).toEqual({ tone: "neutral", label: "Boş", callBadge: false, callOverdue: false });
  });
});

describe("TONES", () => {
  it.each(Object.keys(TONES) as StatusTone[])("%s fg/bg >= 4.5:1", (tone) => {
    expect(contrastRatio(token(TONES[tone].fg), token(TONES[tone].bg))).toBeGreaterThanOrEqual(4.5);
  });
  it("kenar biçimi renkten bağımsız ayırt eder", () => {
    expect(TONES.pending.border).toBe("thick");
    expect(TONES.ready.border).toBe("double");
    expect(TONES.scanned.border).toBe("dashed");
  });
});
