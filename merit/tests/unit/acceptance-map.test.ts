import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ACCEPTANCE_MAP } from "../e2e/acceptance/ACCEPTANCE_MAP";
import { JOB_NAMES } from "../e2e/helpers/run-jobs";

const root = path.resolve(__dirname, "../..");
const e2e = path.join(root, "tests/e2e");

describe("ACCEPTANCE_MAP", () => {
  it("10 kriter, n 1..10 tekil", () => {
    expect(ACCEPTANCE_MAP.map((e) => e.n)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it("her kabul dosyası ve destek dosyası diskte var ve @kabul-N etiketi taşır; birim dosyaları var", () => {
    for (const e of ACCEPTANCE_MAP) {
      const files = [...(e.acceptance ? [path.join("acceptance", e.acceptance)] : []), ...e.supporting];
      for (const f of files) {
        const full = path.join(e2e, f);
        expect(existsSync(full), full).toBe(true);
        expect(readFileSync(full, "utf8"), `${f} → @kabul-${e.n}`).toContain(`@kabul-${e.n}`);
      }
      for (const u of e.unit) expect(existsSync(path.join(root, "tests/unit", u)), u).toBe(true);
      for (const j of e.jobs) expect(JOB_NAMES, j).toContain(j);
      expect(e.status === "kanıtlı" ? e.acceptance !== null : true).toBe(true);
    }
  });

  it("izlenebilirlik belgesi her kriteri ve kanıt dosyasını anar", () => {
    const doc = path.resolve(root, "../docs/kabul/izlenebilirlik.md");
    expect(existsSync(doc)).toBe(true);
    const text = readFileSync(doc, "utf8");
    for (const e of ACCEPTANCE_MAP) {
      expect(text).toContain(`@kabul-${e.n}`);
      if (e.acceptance) expect(text).toContain(e.acceptance);
    }
  });
});
