import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/mailer", () => ({ sendMail: vi.fn() }));
vi.mock("@/lib/settings", () => ({ getSetting: vi.fn(), getSettings: vi.fn() }));
vi.mock("@/modules/core/server/notifications", () => ({ notify: vi.fn() }));
vi.mock("@/modules/menu/server/translations", () => ({ loadTranslationConfig: vi.fn() }));

const { deeplQuotaLevel, fetchDeeplUsage } = await import("@/modules/menu/server/deeplUsage");

describe("DeepL usage", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("reads the free endpoint for a :fx key and computes what is left", async () => {
    const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(async () => new Response(JSON.stringify({ character_count: 126692, character_limit: 1000000 })));
    vi.stubGlobal("fetch", fetchMock);
    const usage = await fetchDeeplUsage("abc:fx");
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe("https://api-free.deepl.com/v2/usage");
    expect(usage).toEqual({ used: 126692, limit: 1000000, remaining: 873308, remainingPercent: 87, plan: "FREE" });
  });

  it("rejects an error status and a malformed answer", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 403 })));
    await expect(fetchDeeplUsage("abc")).rejects.toThrow("HTTP 403");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({}))));
    await expect(fetchDeeplUsage("abc")).rejects.toThrow("geçersiz");
  });

  it("grades the remaining share", () => {
    expect(deeplQuotaLevel({ remainingPercent: 87 })).toBe("OK");
    expect(deeplQuotaLevel({ remainingPercent: 20 })).toBe("LOW");
    expect(deeplQuotaLevel({ remainingPercent: 5 })).toBe("CRITICAL");
  });
});
