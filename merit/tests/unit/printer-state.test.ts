import { describe, expect, it } from "vitest";
import { PRINTER_ONLINE_AFTER_MS, printerStateFromPing } from "@/components/pos/printerState";

const now = Date.parse("2026-11-04T10:00:00Z");
const ping = (ageMs: number, lastStatus: string | null = "OK") => ({ lastSeenAt: new Date(now - ageMs), lastStatus });

describe("printerStateFromPing", () => {
  it("90 saniye sınırı: tam 90 sn çevrimiçi, 90 sn + 1 ms hata", () => {
    expect(PRINTER_ONLINE_AFTER_MS).toBe(90_000);
    expect(printerStateFromPing(ping(90_000), now)).toBe("ok");
    expect(printerStateFromPing(ping(90_001), now)).toBe("error");
  });

  it("taze ama OK olmayan durum hata sayılır", () => {
    expect(printerStateFromPing(ping(1_000, "ERROR"), now)).toBe("error");
    expect(printerStateFromPing(ping(1_000, null), now)).toBe("error");
  });

  it("hiç ping yoksa ya da yazıcı yoksa bilinmiyor", () => {
    expect(printerStateFromPing(null, now)).toBe("unknown");
    expect(printerStateFromPing({ lastSeenAt: null, lastStatus: null }, now)).toBe("unknown");
  });
});
