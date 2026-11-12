import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TRANSLATION_LANGS, autoCloudTranslate } from "@/modules/menu/server/translations";

/** Answer of the keyless endpoint for one request: "<text>|<lang>". */
const answer = (url: string, init?: { body?: string }) => {
  const u = new URL(url);
  const q = u.searchParams.get("q") ?? decodeURIComponent(String(init?.body ?? "").replace(/^q=/, ""));
  return { ok: true, json: async () => [[[`${q}|${u.searchParams.get("tl")}`]]] };
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("autoCloudTranslate", () => {
  it("geçici olarak boş dönen dili yeniden dener ve çeviriyi tamamlar", async () => {
    const name = `Deneme ${randomUUID()}`;
    let itFailures = 0;
    const fetchMock = vi.fn(async (url: string, init?: { body?: string }) => {
      if (new URL(url).searchParams.get("tl") === "it" && itFailures < 2) {
        itFailures++;
        return { ok: false, status: 429, json: async () => ({}) };
      }
      return answer(url, init);
    });
    vi.stubGlobal("fetch", fetchMock);
    const out = await autoCloudTranslate(name, null);
    expect(out.it).toEqual({ name: `${name}|it`, detail: null });
    expect(Object.keys(out).sort()).toEqual([...TRANSLATION_LANGS].sort());
    expect(itFailures).toBe(2);
  });

  it("aynı anda en fazla üç istek gönderir", async () => {
    let inFlight = 0;
    let peak = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: { body?: string }) => {
        inFlight++;
        peak = Math.max(peak, inFlight);
        await new Promise((r) => setTimeout(r, 5));
        inFlight--;
        return answer(url, init);
      }),
    );
    await autoCloudTranslate(`Ad ${randomUUID()}`, `Ayrıntı ${randomUUID()}`);
    expect(peak).toBeLessThanOrEqual(3);
    expect(peak).toBeGreaterThan(0);
  });

  it("bir dil hiç gelmezse beklenen hata verir; gelen diller saklanır ve sonraki deneme yalnız eksiği ister", async () => {
    const name = `Kalıcı ${randomUUID()}`;
    const down = vi.fn(async (url: string, init?: { body?: string }) =>
      new URL(url).searchParams.get("tl") === "ar" ? { ok: false, status: 429, json: async () => ({}) } : answer(url, init),
    );
    vi.stubGlobal("fetch", down);
    await expect(autoCloudTranslate(name, null)).rejects.toMatchObject({
      name: "DomainError",
      code: "RATE_LIMITED",
      message: expect.stringContaining("AR"),
    });

    const up = vi.fn(async (url: string, init?: { body?: string }) => answer(url, init));
    vi.stubGlobal("fetch", up);
    const out = await autoCloudTranslate(name, null);
    expect(out.ar.name).toBe(`${name}|ar`);
    expect(up).toHaveBeenCalledTimes(1);
    expect(new URL(String(up.mock.calls[0][0])).searchParams.get("tl")).toBe("ar");
  });

  it("boş ayrıntı eksik çeviri sayılmaz", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: { body?: string }) => answer(url, init)));
    const out = await autoCloudTranslate(`Boş ${randomUUID()}`, "   ");
    expect(out.en.detail).toBeNull();
  });

  it("uzun metni POST gövdesinde gönderir", async () => {
    const detail = `${randomUUID()} ${"çok uzun açıklama ".repeat(120)}`.trim();
    const fetchMock = vi.fn(async (url: string, init?: { method?: string; body?: string }) => answer(url, init));
    vi.stubGlobal("fetch", fetchMock);
    const out = await autoCloudTranslate(`Uzun ${randomUUID()}`, detail);
    expect(out.de.detail).toBe(`${detail}|de`);
    const posts = fetchMock.mock.calls.filter((c) => c[1]?.method === "POST");
    expect(posts).toHaveLength(TRANSLATION_LANGS.length);
    expect(String(posts[0][0])).not.toContain("&q=");
  });
});
