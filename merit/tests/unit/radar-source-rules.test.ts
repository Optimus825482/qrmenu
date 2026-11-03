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

/** The one module-level exception of the "no continuous motion" rule: the animated scene layer (Task 13). */
const MOTION_DIR = "src/modules/radar/ui/motion/";
const inMotion = (f: string) => f.split("\\").join("/").startsWith(MOTION_DIR);
const MOTION_ONLY = new Set(["animation", "@keyframes", "infinite"]);

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
      const scanned = MOTION_ONLY.has(name) ? files.filter((f) => !inMotion(f)) : files;
      const hits = scanned.flatMap((f) =>
        readFileSync(f, "utf8")
          .split(/\r?\n/)
          .map((line, i) => ({ f, i: i + 1, line }))
          .filter((x) => re.test(x.line))
          .map((x) => `${x.f.replace(/\\/g, "/")}:${x.i}: ${x.line.trim()}`),
      );
      expect(hits).toEqual([]);
    });
  }

  it("keeps the motion exception inside ui/motion/** and motion.css", () => {
    const motion = files.filter(inMotion);
    expect(motion.some((f) => f.endsWith("motion.css"))).toBe(true);
    expect(motion.some((f) => f.endsWith("MotionLayer.tsx"))).toBe(true);
    // Everything outside the folder still has no animation at all.
    const leaks = files
      .filter((f) => !inMotion(f))
      .filter((f) => /\banimation\b|@keyframes|\binfinite\b/.test(readFileSync(f, "utf8")));
    expect(leaks).toEqual([]);
  });

  it("motion.css animates transform and opacity only, with a single continuous ring", () => {
    const css = readFileSync(join(MOTION_DIR, "motion.css"), "utf8");
    const blocks = [...css.matchAll(/@keyframes\s+[\w-]+\s*\{((?:[^{}]*\{[^{}]*\})*)\s*\}/g)];
    expect(blocks.length).toBeGreaterThan(0);
    for (const b of blocks) {
      const props = [...b[1].matchAll(/([\w-]+)\s*:/g)].map((m) => m[1]);
      expect(props.length).toBeGreaterThan(0);
      for (const p of props) expect(["transform", "opacity"]).toContain(p);
    }
    // Layout-triggering properties never appear in any transition / will-change.
    for (const m of css.matchAll(/(?:transition(?:-property)?|will-change)\s*:\s*([^;]+);/g)) {
      expect(m[1].split(",").every((v) => /^\s*(transform|opacity)\b/.test(v))).toBe(true);
    }
    // `infinite` is used exactly once: the ring of an open call.
    expect(css.match(/\binfinite\b/g)?.length).toBe(1);
    expect(/\.rd-m-ring[^{]*\{[^}]*infinite/.test(css)).toBe(true);
    // Reduced motion hides the whole layer.
    expect(css).toMatch(/prefers-reduced-motion:\s*reduce/);
  });
});
