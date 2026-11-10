import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "../../..");
const read = (f: string) => readFileSync(path.join(ROOT, f), "utf8");

describe("operasyon sözleşmesi (OPS-1..3)", () => {
  it("Merit menü senkronu ayarsız çalışır, başlatmayı durdurmaz ve yıkıcı sipariş silme yok", () => {
    const entry = read("merit/docker-entrypoint.sh");
    expect(entry).toContain('"${SYNC_MERIT_MENUS:-true}"');
    expect(entry).toMatch(/tsx prisma\/seed\/meritMenus\.ts \|\| echo/);
    expect(read("docker-compose.yaml")).toContain("SYNC_MERIT_MENUS: ${SYNC_MERIT_MENUS:-true}");
    const seed = read("merit/prisma/seed/meritMenus.ts");
    expect(seed).not.toMatch(/\.(order|orderItem|orderEvent|printJob)\.deleteMany/);
  });
  it("compose: uygulama sağlık denetimi ve günlük sınırı", () => {
    const compose = read("docker-compose.yaml");
    expect(compose).toContain("/api/health");
    expect(compose).toContain("max-size");
    expect(compose).toContain("max-file");
  });
  it("compose: isteğe bağlı değişkenler uygulamaya boş varsayılanla geçer", () => {
    // Coolify yalnız compose dosyasında anılan değişkenleri konteynere verir.
    const compose = read("docker-compose.yaml");
    for (const name of [
      "SETTINGS_SECRET_KEY",
      "VAPID_PUBLIC_KEY",
      "VAPID_PRIVATE_KEY",
      "VAPID_SUBJECT",
      "PUSH_ENDPOINT_ALLOWLIST",
      "TRANSLATE_PROVIDER",
      "DEEPL_AUTH_KEY",
      "GEMINI_API_KEY",
      "DB_POOL_MAX",
      "ENV_LABEL",
    ]) {
      expect(compose, name).toContain(`${name}: \${${name}:-}`);
    }
  });
  it("deploy/coolify betikleri: shebang, LF, strict mode; hazır değer içermez", () => {
    for (const name of ["sunucu-hazirlik.sh", "env-uret.sh", "yedek.sh"]) {
      const text = read(`deploy/coolify/${name}`);
      expect(text.startsWith("#!/usr/bin/env bash\n"), name).toBe(true);
      expect(text, name).not.toContain("\r");
      expect(text, name).toContain("set -euo pipefail");
      expect(text, name).not.toMatch(/[A-Za-z0-9+/]{40,}={0,2}/);
    }
    const backup = read("deploy/coolify/yedek.sh");
    expect(backup).toContain("pg_dump -Fc");
    expect(backup).toContain("pg_restore --list");
    expect(backup).toMatch(/-mtime/);
  });
  it("imaj: çalışma anında okunan assets klasörü (PDF yazı tipleri, oda QR şablonu) kopyalanır", () => {
    for (const file of ["Dockerfile", "merit/Dockerfile"]) {
      expect(read(file), file).toContain("COPY --from=builder /app/assets ./assets");
    }
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
