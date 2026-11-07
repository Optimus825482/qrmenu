import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "../../..");
const read = (file: string) => readFileSync(path.join(root, file), "utf8");
const job = (text: string, id: string) => {
  const match = text.match(new RegExp(`^  ${id}:\\n([\\s\\S]*?)(?=^  [a-z][a-z-]*:|$(?![\\s\\S]))`, "m"));
  expect(match, `${id} işi`).not.toBeNull();
  return match![1];
};

describe("P8 teslim CI sözleşmesi", () => {
  it("bağımsız işler, elle tetikleme, şema farkı ve üretim health kapıları", () => {
    const text = read(".github/workflows/ci.yml");
    for (const trigger of ["push", "pull_request", "workflow_dispatch"]) expect(text).toMatch(new RegExp(`^  ${trigger}:`, "m"));
    expect(text).toContain("cancel-in-progress: true");
    expect(text).toContain("ci-${{ github.ref }}");
    const check = job(text, "check");
    const e2e = job(text, "e2e");
    for (const id of ["gateway", "load-tools", "audit"]) expect(job(text, id)).toContain("ubuntu-latest");
    expect(check).toContain("TZ: Europe/Istanbul");
    expect(check).toContain("prisma migrate diff");
    expect(check).toContain("--exit-code");
    expect(e2e).toContain("npm run build");
    expect(e2e).toContain("/api/health");
    expect(e2e).toContain("npm run test:e2e");
    expect(e2e).not.toMatch(/^    needs:/m);
    expect(e2e).toContain("timeout-minutes: 45");
    expect(text).toContain("merit/test-results/");
    expect(text).toContain("merit/playwright-report/");
    for (const [, action] of text.matchAll(/uses:\s*(\S+)/g)) expect(action).toMatch(/@v\d+(?:\.\d+)*$/);
    expect(text).not.toContain("next dev");
  });
  it("yük smoke yalnız elle tetiklenir ve yerel hedefi sınar", () => {
    const text = read(".github/workflows/load-smoke.yml");
    expect(text).toMatch(/^  workflow_dispatch:/m);
    expect(text).not.toMatch(/^  (push|pull_request|schedule):/m);
    expect(text).toContain("npm run load:smoke");
    expect(text).toContain("/api/health");
    expect(text).not.toContain("LOAD_ALLOW_HOST");
  });
  it("teslim belgesi altı bölümü ve doğrulanmamış saha kalemlerini ayırır", () => {
    const text = read("docs/teslim-kontrol-listesi.md");
    for (const title of ["Kabul matrisi", "Açık noktalar", "Kapsam dışı", "Operasyon", "Kabul imzası", "Son kontrol"]) {
      expect(text).toContain(title);
    }
    for (const item of ["SMTP", "VAPID", "cp857", "guest.ipRateMultiplier", "GitHub", "Linux"]) expect(text).toContain(item);
    expect(text).not.toMatch(/\r|TODO|TBD/);
  });
});
