import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..", "..");
const SRC = join(ROOT, "src");
const PUBLIC = join(ROOT, "public");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(css|ts|tsx|js|json)$/.test(name)) out.push(full);
  }
  return out;
}

describe("local fonts (offline install)", () => {
  const files = walk(SRC);

  it("src has no Google Fonts CDN reference", () => {
    const hits = files.filter((f) => /fonts\.googleapis|fonts\.gstatic/.test(readFileSync(f, "utf8")));
    expect(hits).toEqual([]);
  });

  it("every @font-face url() points to a real font file in public", () => {
    const missing: string[] = [];
    let count = 0;
    for (const f of files.filter((x) => x.endsWith(".css"))) {
      const css = readFileSync(f, "utf8");
      for (const block of css.match(/@font-face\s*\{[^}]*\}/g) ?? []) {
        for (const m of block.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)) {
          count++;
          const file = join(PUBLIC, m[1]);
          if (!existsSync(file) || statSync(file).size < 10_000) missing.push(m[1]);
        }
      }
    }
    expect(count).toBeGreaterThan(0);
    expect(missing).toEqual([]);
  });
});
