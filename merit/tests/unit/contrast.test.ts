import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { contrastRatio } from "@/lib/contrast";

const css = readFileSync(path.resolve(__dirname, "../../src/app/globals.css"), "utf8");
const token = (name: string): string => {
  const m = css.match(new RegExp("(?:^|[\\s;{])" + name + ":\\s*(#[0-9a-fA-F]{3,6})\\s*;"));
  if (!m) throw new Error(`token ${name} not found`);
  return m[1];
};

describe("contrastRatio", () => {
  it("black on white is 21", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBe(21);
    expect(contrastRatio("#000", "#fff")).toBe(21);
  });
  it("mid grey on white fails AA", () => {
    expect(contrastRatio("#777777", "#ffffff")).toBeLessThan(4.5);
  });
  it("is symmetric", () => {
    expect(contrastRatio("#ffffff", "#2563eb")).toBeCloseTo(contrastRatio("#2563eb", "#ffffff"), 10);
  });
});

describe("token pairs meet 4.5:1", () => {
  it.each([
    ["--warn", "--warn-bg"],
    ["--info", "--info-bg"],
    ["--success", "--success-bg"],
    ["--danger", "--danger-bg"],
    ["--text", "--bg"],
    ["--muted", "--bg"],
  ])("%s on %s", (fg, bg) => {
    expect(contrastRatio(token(fg), token(bg))).toBeGreaterThanOrEqual(4.5);
  });
});
