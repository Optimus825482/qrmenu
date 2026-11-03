import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Cırcır (ratchet): küçük yazı ve ham palet sayaçları yalnız küçülebilir.
 * Gerçek sayı kayıttan büyükse düşer (yeni ihlal), küçükse de düşer ("kaydı düşür"): uxRatchet.json güncellenir.
 * Task 15 hedefi her ikisi için 0.
 */
const ROOT = join(__dirname, "..", "..");
const SRC = join(ROOT, "src");
const record = JSON.parse(readFileSync(join(__dirname, "uxRatchet.json"), "utf8")) as {
  smallText: Record<string, number>;
  rawPalette: Record<string, number>;
};

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx$/.test(name)) out.push(p);
  }
  return out;
}

const rel = (p: string) => relative(ROOT, p).split("\\").join("/");
const STAFF_SCOPE = /^src\/(app\/(kat|depo)\/|app\/\(ops\)\/|components\/(staff|pos)\/)/;
const PALETTE_SCOPE = /^src\/app\/(kat|depo)\/|^src\/app\/\(ops\)\//;

export function scanRatchet(regex: RegExp, scope: RegExp): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of walk(SRC)) {
    const r = rel(p);
    if (!scope.test(r)) continue;
    const n = [...readFileSync(p, "utf8").matchAll(new RegExp(regex.source, "g"))].length;
    if (n > 0) out[r] = n;
  }
  return out;
}

function compare(actual: Record<string, number>, recorded: Record<string, number>): string[] {
  const problems: string[] = [];
  for (const k of new Set([...Object.keys(actual), ...Object.keys(recorded)])) {
    const a = actual[k] ?? 0;
    const r = recorded[k] ?? 0;
    if (a > r) problems.push(`${k}: ${a} > kayıt ${r} (yeni ihlal)`);
    else if (a < r) problems.push(`${k}: ${a} < kayıt ${r} (kaydı düşür: tests/unit/uxRatchet.json)`);
  }
  return problems;
}

describe("UX cırcır sayaçları", () => {
  it("küçük yazı (9–12 px sabit) kayıtla eşleşir", () => {
    expect(compare(scanRatchet(/text-\[(?:9|10|11|12)px\]/, STAFF_SCOPE), record.smallText)).toEqual([]);
  });
  it("ham palet (slate|indigo|purple|zinc|gray-NNN) kayıtla eşleşir", () => {
    expect(compare(scanRatchet(/\b(?:slate|indigo|purple|zinc|gray)-\d{2,3}\b/, PALETTE_SCOPE), record.rawPalette)).toEqual([]);
  });
});
