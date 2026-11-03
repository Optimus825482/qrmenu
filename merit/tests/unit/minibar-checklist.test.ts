import { describe, expect, it } from "vitest";
import { buildChecklist } from "@/modules/minibar/checklist";

const mini = { id: "s-mini", name: "MINI", isInsideCabinet: true };
const maxi = { id: "s-maxi", name: "MAXI", isInsideCabinet: true };
const extra = { id: "s-extra", name: "EXTRA", isInsideCabinet: false };

describe("buildChecklist", () => {
  it("iki dolaplı oda tipi: dolap içi setup iki kez, dolap dışı bir kez", () => {
    const list = buildChecklist({ cabinetCount: 2 }, [mini, extra]);
    expect(list.map((e) => e.label)).toEqual(["MINI - Dolap 1", "MINI - Dolap 2", "EXTRA"]);
    expect(list.map((e) => e.cabinetNo)).toEqual([1, 2, null]);
    expect(list.map((e) => `${e.copy}/${e.copies}`)).toEqual(["1/2", "2/2", "1/1"]);
    expect(list.map((e) => e.setupName)).toEqual(["MINI", "MINI", "EXTRA"]);
    expect(list.map((e) => e.setupId)).toEqual(["s-mini", "s-mini", "s-extra"]);
  });

  it("dolap sayısı 0 en az bir dolap sayılır", () => {
    const list = buildChecklist({ cabinetCount: 0 }, [mini, extra]);
    expect(list.map((e) => e.label)).toEqual(["MINI - Dolap 1", "EXTRA"]);
    expect(list.map((e) => `${e.copy}/${e.copies}`)).toEqual(["1/1", "1/1"]);
  });

  it("iki dolap içi setup ad sırasıyla gelir (girdi sırası önemsiz)", () => {
    const list = buildChecklist({ cabinetCount: 1 }, [mini, maxi]);
    expect(list.map((e) => e.label)).toEqual(["MAXI - Dolap 1", "MINI - Dolap 1"]);
  });

  it("dolap dışı hiçbir zaman dolap içinden önce gelmez", () => {
    for (const order of [[extra, mini, maxi], [mini, extra, maxi], [maxi, mini, extra]]) {
      const list = buildChecklist({ cabinetCount: 3 }, order);
      const firstOutside = list.findIndex((e) => e.cabinetNo === null);
      const lastInside = list.map((e) => e.cabinetNo !== null).lastIndexOf(true);
      expect(firstOutside).toBeGreaterThan(lastInside);
    }
  });

  it("setup yoksa liste boş; girdiyi değiştirmez", () => {
    expect(buildChecklist({ cabinetCount: 2 }, [])).toEqual([]);
    const input = [mini, extra, maxi];
    buildChecklist({ cabinetCount: 2 }, input);
    expect(input.map((s) => s.id)).toEqual(["s-mini", "s-extra", "s-maxi"]);
  });
});
