import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  DomainError,
  fail,
  fromZod,
  ok,
  safeAction,
  type ErrorCode,
} from "@/lib/result";

describe("ok / fail", () => {
  it("ok başarılı sonuç döner", () => {
    expect(ok({ a: 1 })).toEqual({ ok: true, data: { a: 1 } });
  });

  it("fail düz (serileştirilebilir) hata nesnesi döner", () => {
    const r = fail("NOT_FOUND", "Kayıt yok");
    expect(r).toEqual({ ok: false, error: { code: "NOT_FOUND", message: "Kayıt yok" } });
    expect(JSON.parse(JSON.stringify(r))).toEqual(r);
  });

  it("fail ek alanları (fieldErrors, errorId) taşır", () => {
    const r = fail("VALIDATION", "Geçersiz", { fieldErrors: { name: ["Zorunlu"] } });
    expect(r).toEqual({
      ok: false,
      error: { code: "VALIDATION", message: "Geçersiz", fieldErrors: { name: ["Zorunlu"] } },
    });
  });
});

describe("DomainError.httpStatus", () => {
  const table: [ErrorCode, number][] = [
    ["VALIDATION", 400],
    ["UNAUTHORIZED", 401],
    ["FORBIDDEN", 403],
    ["NOT_FOUND", 404],
    ["CONFLICT", 409],
    ["STOCK_INSUFFICIENT", 409],
    ["DAILY_LIMIT", 409],
    ["RATE_LIMITED", 429],
    ["INTERNAL", 500],
  ];

  it.each(table)("%s -> %i", (code, status) => {
    const e = new DomainError(code, "x");
    expect(e).toBeInstanceOf(Error);
    expect(e.code).toBe(code);
    expect(e.httpStatus).toBe(status);
    expect(e.message).toBe("x");
  });
});

describe("fromZod", () => {
  it("alanları path.join('.') ile gruplar, boş path için '_' kullanır", () => {
    const schema = z
      .object({
        name: z.string().min(2, "En az 2 karakter"),
        address: z.object({ city: z.string().min(1, "Şehir zorunlu") }),
      })
      .refine(() => false, "Genel hata");
    const parsed = schema.safeParse({ name: "a", address: { city: "" } });
    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    const e = fromZod(parsed.error);
    expect(e.code).toBe("VALIDATION");
    expect(e.httpStatus).toBe(400);
    expect(e.fieldErrors?.name).toEqual(["En az 2 karakter"]);
    expect(e.fieldErrors?.["address.city"]).toEqual(["Şehir zorunlu"]);
  });

  it("path'i boş olan sorun '_' anahtarına düşer", () => {
    const parsed = z.string().safeParse(42);
    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    const e = fromZod(parsed.error);
    expect(Object.keys(e.fieldErrors ?? {})).toEqual(["_"]);
  });
});

describe("safeAction", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const schema = z.object({ n: z.number() });

  it("geçerli girdide handler sonucunu ok olarak döner", async () => {
    const action = safeAction(schema, async ({ n }) => n * 2);
    expect(await action({ n: 4 })).toEqual({ ok: true, data: 8 });
  });

  it("zod hatasını VALIDATION + fieldErrors olarak döner", async () => {
    const handler = vi.fn(async () => 1);
    const action = safeAction(schema, handler);
    const r = await action({ n: "x" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe("VALIDATION");
    expect(r.error.fieldErrors).toBeDefined();
    expect(r.error.fieldErrors?.n?.length).toBeGreaterThan(0);
    expect(handler).not.toHaveBeenCalled();
  });

  it("DomainError'u olduğu gibi geçirir", async () => {
    const action = safeAction(schema, async () => {
      throw new DomainError("CONFLICT", "Zaten var");
    });
    const r = await action({ n: 1 });
    expect(r).toEqual({ ok: false, error: { code: "CONFLICT", message: "Zaten var" } });
  });

  it("bilinmeyen hatayı INTERNAL + errorId olarak döner, orijinal mesajı sızdırmaz", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const original = new Error("gizli-veritabani-ayrintisi");
    const action = safeAction(schema, async () => {
      throw original;
    });
    const r = await action({ n: 1 });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe("INTERNAL");
    expect(r.error.message).toBe("Beklenmeyen bir hata oluştu");
    expect(r.error.message).not.toContain("gizli-veritabani-ayrintisi");
    expect(r.error.errorId).toMatch(/^[0-9a-f]{8}$/);
    expect(JSON.stringify(r)).not.toContain("gizli-veritabani-ayrintisi");
    expect(spy).toHaveBeenCalledTimes(1);
    const logged = spy.mock.calls[0];
    expect(String(logged[0])).toContain(r.error.errorId);
    expect(logged).toContain(original);
  });
});
