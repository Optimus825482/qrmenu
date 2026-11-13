// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Ctx } from "@/lib/auth";
import { ctxForHotel } from "@/modules/minibar/server/selectedHotel";
import { mbFetch, withHotel } from "@/modules/minibar/ui/mbFetch";

const ctx = { session: { id: "s", hotelId: "royal" }, hotelIds: ["royal", "diamond"] } as unknown as Ctx;

describe("ctxForHotel", () => {
  it("keeps the session's hotel when none (or the same one) is asked for", () => {
    expect(ctxForHotel(ctx, null)).toBe(ctx);
    expect(ctxForHotel(ctx, "")).toBe(ctx);
    expect(ctxForHotel(ctx, "royal")).toBe(ctx);
  });

  it("serves another hotel of the user's scope without touching the session's own context", () => {
    const shown = ctxForHotel(ctx, "diamond");
    expect(shown.session.hotelId).toBe("diamond");
    expect(shown.hotelIds).toEqual(["royal", "diamond"]);
    expect(ctx.session.hotelId).toBe("royal");
  });

  it("refuses a hotel outside the user's scope instead of falling back to the session's", () => {
    expect(() => ctxForHotel(ctx, "premium")).toThrowError(/yetkiniz yok/);
  });
  it("never moves an outlet session to another hotel, even one in scope", () => {
    const outlet = { ...ctx, session: { ...ctx.session, outletId: "o1" } } as unknown as Ctx;
    expect(ctxForHotel(outlet, "royal")).toBe(outlet);
    expect(() => ctxForHotel(outlet, "diamond")).toThrowError(/yetkiniz yok/);
  });
});

describe("mbFetch / withHotel", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    window.history.replaceState(null, "", "/");
  });

  const stubFetch = () => {
    const spy = vi.fn(async (_url: string, _init?: RequestInit) => new Response("{}"));
    vi.stubGlobal("fetch", spy);
    return spy;
  };

  it("is plain fetch when the address names no hotel", async () => {
    const spy = stubFetch();
    await mbFetch("/api/minibar/stock", { cache: "no-store" });
    expect(spy).toHaveBeenCalledWith("/api/minibar/stock", { cache: "no-store" });
  });

  it("names the window's hotel, and keeps the caller's own headers", async () => {
    window.history.replaceState(null, "", "/kat/stok?font=a&theme=b&hotelId=diamond");
    const spy = stubFetch();
    await mbFetch("/api/minibar/stock", { method: "PATCH", headers: { "Content-Type": "application/json" } });
    const init = spy.mock.calls[0]![1] as RequestInit;
    const headers = new Headers(init.headers);
    expect(headers.get("x-merit-hotel")).toBe("diamond");
    expect(headers.get("content-type")).toBe("application/json");
    expect(init.method).toBe("PATCH");
  });

  it("prefers the hotel of the page's own selector over the address", async () => {
    window.history.replaceState(null, "", "/depo/doluluk-yukle?hotelId=diamond");
    const spy = stubFetch();
    await mbFetch("/api/minibar/tasks/regenerate", { method: "POST" }, "premium");
    expect(new Headers((spy.mock.calls[0]![1] as RequestInit).headers).get("x-merit-hotel")).toBe("premium");
  });

  it("appends the hotel to a link once", () => {
    expect(withHotel("/depo/stok", "diamond")).toBe("/depo/stok?hotelId=diamond");
    expect(withHotel("/kat/stok?sort=name", "diamond")).toBe("/kat/stok?sort=name&hotelId=diamond");
    expect(withHotel("/depo/stok?hotelId=royal", "diamond")).toBe("/depo/stok?hotelId=royal");
    expect(withHotel("/depo/stok")).toBe("/depo/stok");
  });
});
