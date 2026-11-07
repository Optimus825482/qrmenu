import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SCREENS } from "../../src/modules/core/screens";

const root = path.resolve(__dirname, "../../..");
const guides = ["yonetici", "kat-sorumlusu", "depo", "garson-kasa", "mutfak", "misafir"];
const dir = path.join(root, "docs/kilavuz");

describe("Eğitim kılavuzları", () => {
  it("altı rol, eğitim planı, sıralı başlıklar ve gerçek görüntü bağlantıları içerir", async () => {
    expect(existsSync(path.join(dir, "README.md"))).toBe(true);
    const { SHOTS } = await import("../e2e/guide/shots");
    const referenced = new Set<string>();
    for (const guide of guides) {
      const text = readFileSync(path.join(dir, `${guide}.md`), "utf8");
      const headings = ["## Bu kılavuz kimin için", "## Giriş", "## Günlük işler", "## Sık sorunlar", "## Hızlı kart"];
      let previous = -1;
      for (const heading of headings) {
        const index = text.indexOf(heading);
        expect(index, `${guide}: ${heading}`).toBeGreaterThan(previous);
        previous = index;
      }
      expect(text).not.toMatch(/\r|TODO|TBD|XXX|lorem|Test!2026|SEED_ADMIN|[A-Za-z0-9+/]{32,}/);
      const terms = text.split("## Terimler")[1] ?? "";
      for (const [, screen] of text.matchAll(/\*\*([^*]+)\*\*/g)) {
        expect(SCREENS.some((s) => s.name === screen) || terms.includes(screen), screen).toBe(true);
      }
      const images = [...text.matchAll(/!\[[^\]]*\]\(img\/([^)]*\.png)\)/g)];
      expect(images.length).toBeGreaterThanOrEqual(6);
      expect(images.length).toBeLessThanOrEqual(14);
      for (const [, file] of images) {
        referenced.add(file);
        const target = path.join(dir, "img", file);
        expect(existsSync(target), target).toBe(true);
        expect(statSync(target).size).toBeLessThanOrEqual(600 * 1024);
        expect(readFileSync(target).subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
      }
      const count = SHOTS.filter((shot) => shot.guide === guide).length;
      expect(count).toBeGreaterThanOrEqual(6);
      expect(count).toBeLessThanOrEqual(14);
    }
    expect(new Set(SHOTS.map((s) => `${s.guide}-${s.id}.png`))).toEqual(referenced);
    const files = readdirSync(path.join(dir, "img")).filter((f) => f.endsWith(".png"));
    expect(new Set(files)).toEqual(referenced);
    expect(files.reduce((n, f) => n + statSync(path.join(dir, "img", f)).size, 0)).toBeLessThanOrEqual(20 * 1024 * 1024);
  });
});
