import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "../../..");
const read = (f: string) => readFileSync(path.join(ROOT, f), "utf8");

describe("operasyon sözleşmesi (OPS-1..3)", () => {
  it("Merit menü senkronu varsayılan kapalı ve yıkıcı sipariş silme yok", () => {
    const entry = read("merit/docker-entrypoint.sh");
    expect(entry).toContain('"${SYNC_MERIT_MENUS:-false}"');
    expect(read("docker-compose.yaml")).toContain("SYNC_MERIT_MENUS: ${SYNC_MERIT_MENUS:-false}");
    const seed = read("merit/prisma/seed/meritMenus.ts");
    expect(seed).not.toMatch(/\.(order|orderItem|orderEvent|printJob)\.deleteMany/);
  });
  it("compose: uygulama sağlık denetimi ve günlük sınırı", () => {
    const compose = read("docker-compose.yaml");
    expect(compose).toContain("/api/health");
    expect(compose).toContain("max-size");
    expect(compose).toContain("max-file");
  });
  it("CI üretimle aynı: Node 22, PostgreSQL 16", () => {
    const ci = read(".github/workflows/ci.yml");
    expect(ci).not.toMatch(/node-version:\s*24/);
    expect(ci).not.toContain("postgres:17");
    expect(ci).toContain("node-version: 22");
    expect(ci).toContain("image: postgres:16");
    expect(read("merit/Dockerfile")).toContain("FROM node:22-alpine");
  });
});
