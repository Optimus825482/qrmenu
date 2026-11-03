import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/** Source scan of the radar UI: tokens only, no emoji, no continuous motion, no prices, no shopping wording. */
const ROOTS = ["src/modules/radar/ui", "src/app/radar", "src/modules/radar/labels.ts"];

function walk(path: string): string[] {
  const st = statSync(path, { throwIfNoEntry: false });
  if (!st) return [];
  if (st.isFile()) return [path];
  return readdirSync(path).flatMap((n) => walk(join(path, n)));
}

const files = ROOTS.flatMap(walk).filter((f) => /\.(tsx?|css)$/.test(f));

const RULES: [string, RegExp][] = [
  ["raw hex colour", /#[0-9a-fA-F]{3,8}\b(?![\w-])/],
  ["rgb()/rgba()/hsl()", /\b(?:rgba?|hsla?)\(/],
  ["Tailwind palette", /\b(?:slate|indigo|purple|zinc)-\d|\bgray-\d/],
  ["animate-", /\banimate-/],
  ["animation", /\banimation\b/],
  ["@keyframes", /@keyframes/],
  ["infinite", /\binfinite\b/],
  ["price literal", /[₺€]/],
  ["sepet", /sepet/i],
  ["emoji / dingbat", /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{2190}-\u{21FF}\u{25A0}-\u{25FF}]/u],
];

describe("radar UI source rules", () => {
  it("scans at least the files it should", () => {
    expect(files.length).toBeGreaterThan(5);
    expect(files.some((f) => f.endsWith("radar.css"))).toBe(true);
  });

  for (const [name, re] of RULES) {
    it(`has no ${name}`, () => {
      const hits = files.flatMap((f) =>
        readFileSync(f, "utf8")
          .split(/\r?\n/)
          .map((line, i) => ({ f, i: i + 1, line }))
          .filter((x) => re.test(x.line))
          .map((x) => `${x.f.replace(/\\/g, "/")}:${x.i}: ${x.line.trim()}`),
      );
      expect(hits).toEqual([]);
    });
  }
});
