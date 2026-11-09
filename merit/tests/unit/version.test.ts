import { describe, expect, it } from "vitest";
import { getVersionInfo, APP_VERSION } from "../../src/lib/version";
import { GET } from "../../src/app/api/version/route";

describe("Sistem Versiyonlama ve Güncelleme API", () => {
  it("getVersionInfo doğru versiyon ve derleme bilgilerini döner", () => {
    const info = getVersionInfo();
    expect(info.version).toBe(APP_VERSION);
    expect(info.version).toMatch(/^\d+\.\d+\.\d+/);
    expect(info.buildDate).toBeTruthy();
    expect(info.buildId).toBeTruthy();
    expect(info.highlights.length).toBeGreaterThan(0);
    expect(info.timestamp).toBeGreaterThan(0);
  });

  it("GET /api/version route no-store başlıkları ile JSON döner", async () => {
    const response = await GET();
    expect(response.status).toBe(200);

    const headers = response.headers;
    expect(headers.get("Cache-Control")).toContain("no-store");
    expect(headers.get("Cache-Control")).toContain("no-cache");

    const data = await response.json();
    expect(data.version).toBe(APP_VERSION);
    expect(data.highlights).toBeInstanceOf(Array);
  });
});
