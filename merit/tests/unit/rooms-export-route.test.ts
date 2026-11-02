import { beforeEach, describe, expect, it, vi } from "vitest";
import { DomainError } from "@/lib/result";

const requireUser = vi.hoisted(() => vi.fn());
const exportExcel = vi.hoisted(() => vi.fn());
const findHotel = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth", () => ({ requireUser }));
vi.mock("@/lib/prisma", () => ({ prisma: { hotel: { findUnique: findHotel } } }));
vi.mock("@/modules/core/server/admin/rooms", () => ({ exportExcel }));

const { GET } = await import("@/app/api/admin/rooms/export/route");

const get = (query = "?hotelId=h1") => GET(new Request(`http://localhost/api/admin/rooms/export${query}`));

describe("GET /api/admin/rooms/export", () => {
  beforeEach(() => {
    requireUser.mockReset().mockResolvedValue({ user: { id: "u1" } });
    exportExcel.mockReset().mockResolvedValue(Buffer.from("xlsx-bytes"));
    findHotel.mockReset().mockResolvedValue({ code: "ROYAL" });
  });

  it("dosyayı odalar-<otelKodu>.xlsx olarak indirtir", async () => {
    const res = await get();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("spreadsheetml.sheet");
    expect(res.headers.get("content-disposition")).toBe('attachment; filename="odalar-ROYAL.xlsx"');
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(Buffer.from(await res.arrayBuffer()).toString()).toBe("xlsx-bytes");
    expect(exportExcel).toHaveBeenCalledWith({ user: { id: "u1" } }, "h1");
  });

  it("oturum yoksa 401, yetki yoksa 403 (JSON hata), otel belirtilmezse 400", async () => {
    requireUser.mockRejectedValueOnce(new DomainError("UNAUTHORIZED", "Oturum bulunamadı"));
    const unauth = await get();
    expect(unauth.status).toBe(401);
    expect(await unauth.json()).toEqual({ error: "Oturum bulunamadı" });

    exportExcel.mockRejectedValueOnce(new DomainError("FORBIDDEN", "Bu işlem için yetkiniz yok"));
    expect((await get()).status).toBe(403);

    expect((await get("")).status).toBe(400);
    expect(exportExcel).toHaveBeenCalledTimes(1);
  });
});
