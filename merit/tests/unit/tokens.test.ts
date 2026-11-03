import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const read = (rel: string) => readFileSync(path.resolve(__dirname, "../..", rel), "utf8");
const globals = read("src/app/globals.css").replace(/\s+/g, "");
const mobile = read("src/shell/mobile.css");

describe("design tokens", () => {
  it.each([
    ["--tap-xp", "24px"],
    ["--tap-min", "44px"],
    ["--tap-std", "48px"],
    ["--tap-pri", "56px"],
    ["--tap-pos", "64px"],
    ["--space-1", "4px"],
    ["--space-2", "8px"],
    ["--space-3", "12px"],
    ["--space-4", "16px"],
    ["--space-5", "24px"],
    ["--space-6", "32px"],
    ["--space-7", "48px"],
    ["--space-8", "64px"],
    ["--radius-s", "6px"],
    ["--radius-m", "10px"],
    ["--radius-l", "16px"],
  ])("%s is %s", (name, value) => {
    expect(globals).toContain(`${name}:${value};`);
  });

  it("defines the three density scopes", () => {
    for (const d of ["xp", "personel", "pos"]) expect(globals).toContain(`[data-density="${d}"]{`);
  });

  it("defines the status tokens", () => {
    for (const t of ["--warn:#92400e", "--warn-bg:#fef3c7", "--info:#0369a1", "--info-bg:#e0f2fe"]) {
      expect(globals).toContain(t);
    }
    for (const t of ["--success-bg", "--danger-bg", "--muted-bg"]) expect(globals).toContain(`${t}:`);
  });

  it("mobile.css carries no raw hex colors", () => {
    expect(mobile.match(/#[0-9a-f]{3,6}\b/gi)).toBeNull();
    for (const line of mobile.split("\n").filter((l) => /^\s*--mb-(bg|surface|text|muted|line|primary|primary-soft|danger|warn|ok):/.test(l))) {
      expect(line).toMatch(/:\s*var\(--[\w-]+\);/);
    }
  });
});
