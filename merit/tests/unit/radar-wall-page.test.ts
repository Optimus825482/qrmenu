import { describe, expect, it } from "vitest";
import { pageOf } from "@/modules/radar/ui/WallPage";

const ITEMS = Array.from({ length: 20 }, (_, i) => i);
const PAGING = { periodMs: 8000 };

describe("duvar sayfalaması", () => {
  it("pencerede (sayfalama yok) liste tek sayfadır", () => {
    expect(pageOf(ITEMS, 8, undefined, 123_456)).toEqual({ items: ITEMS, page: 0, pages: 1 });
  });

  it("sığan liste sayfalanmaz", () => {
    expect(pageOf(ITEMS.slice(0, 8), 8, PAGING, 99_000).pages).toBe(1);
  });

  it("sayfa saate göre döner, her öge bir turda bir kez görünür", () => {
    const seen: number[] = [];
    for (let k = 0; k < 3; k++) {
      const p = pageOf(ITEMS, 8, PAGING, k * 8000 + 10);
      expect(p).toMatchObject({ page: k, pages: 3 });
      seen.push(...p.items);
    }
    expect(seen).toEqual(ITEMS);
    expect(pageOf(ITEMS, 8, PAGING, 3 * 8000).page).toBe(0);
  });

  it("aynı sayfa süresi içinde değişmez", () => {
    expect(pageOf(ITEMS, 8, PAGING, 8000).page).toBe(pageOf(ITEMS, 8, PAGING, 15_999).page);
  });
});
