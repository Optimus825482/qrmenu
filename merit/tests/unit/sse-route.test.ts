import { describe, expect, it, vi } from "vitest";
import { DomainError } from "@/lib/result";

const requireUser = vi.fn();
vi.mock("@/lib/auth", () => ({ requireUser }));

const { HEAD } = await import("@/app/api/sse/route");

describe("HEAD /api/sse (oturum yoklaması)", () => {
  it("geçerli oturum → 204, gövdesiz, önbelleksiz", async () => {
    requireUser.mockResolvedValueOnce({});
    const res = await HEAD();
    expect(res.status).toBe(204);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.body).toBeNull();
  });

  it("oturum yok / kapalı → 401", async () => {
    requireUser.mockRejectedValueOnce(new DomainError("UNAUTHORIZED", "yok"));
    expect((await HEAD()).status).toBe(401);
  });

  it("beklenmeyen hata yutulmaz", async () => {
    requireUser.mockRejectedValueOnce(new Error("db down"));
    await expect(HEAD()).rejects.toThrow("db down");
  });
});
