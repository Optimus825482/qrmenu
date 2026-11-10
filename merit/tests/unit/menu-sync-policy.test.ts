import { describe, expect, it } from "vitest";
import { decideMenuSync } from "../../prisma/seed/menuSyncPolicy";

const base = { menuNodeCount: 10, orderCount: 0, forceReset: false, isCurrentV2Menu: false };

describe("Merit menü senkron kararı", () => {
  it("boş menü kurulur", () => {
    expect(decideMenuSync({ ...base, menuNodeCount: 0 })).toBe("rebuild");
    expect(decideMenuSync({ ...base, menuNodeCount: 0, orderCount: 5 })).toBe("rebuild");
  });
  it("menüsü olan outlet silinmez, siparişi olsa da olmasa da", () => {
    expect(decideMenuSync(base)).toBe("skip-keep");
    expect(decideMenuSync({ ...base, orderCount: 99 })).toBe("skip-keep");
  });
  it("uyumlu v2 menüde yalnız görseller yenilenir", () => {
    expect(decideMenuSync({ ...base, isCurrentV2Menu: true })).toBe("refresh-images");
  });
  it("zorla sıfırlama siparişi olan outlet'i reddeder", () => {
    expect(decideMenuSync({ ...base, forceReset: true, orderCount: 1 })).toBe("refuse-has-orders");
    expect(decideMenuSync({ ...base, forceReset: true })).toBe("rebuild");
  });
});
