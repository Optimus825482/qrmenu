import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/health/route";
import { prisma } from "@/lib/prisma";

describe("GET /api/health", () => {
  afterEach(() => vi.restoreAllMocks());

  it("200 döner: db ok, işler testte kapalı", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, db: "ok", listener: "disabled", boss: "disabled" });
    expect(new Date(body.time).toISOString()).toBe(body.time);
  });

  it("veritabanı yanıt vermezse 503 ve db 'down' döner", async () => {
    vi.spyOn(prisma, "$queryRaw").mockRejectedValue(new Error("bağlantı koptu"));
    const res = await GET();
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body).toMatchObject({ ok: false, db: "down" });
    expect(JSON.stringify(body)).not.toContain("bağlantı koptu");
  });
});
