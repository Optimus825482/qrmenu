import { describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-forwarded-for": "10.7.7.7" }) }));
const limited = vi.hoisted(() => vi.fn(async () => ({ kind: "NONE", reason: "RATE_LIMITED" })));
const plain = vi.hoisted(() => vi.fn());
vi.mock("@/modules/menu/server/guestToken", () => ({
  guestMeta: () => ({ ip: "10.7.7.7", userAgent: "" }),
  resolveGuestTokenLimited: limited,
  resolveGuestToken: plain,
}));

const { GET } = await import("@/app/api/manifest/guest/[token]/route");

describe("GET /api/manifest/guest/[token]", () => {
  it("tokenı sınırlayıcılı çözümler (log yok); sınırsız çözümleme kullanılmaz", async () => {
    const res = await GET(new Request("http://localhost/api/manifest/guest/abc123"), {
      params: Promise.resolve({ token: "abc123" }),
    });
    expect(res.status).toBe(200);
    expect(limited).toHaveBeenCalledWith("abc123", { ip: "10.7.7.7", userAgent: "" }, undefined, undefined, { log: false });
    expect(plain).not.toHaveBeenCalled();
    expect(await res.json()).toMatchObject({ start_url: "/q/abc123", short_name: "Menü" });
  });
});
