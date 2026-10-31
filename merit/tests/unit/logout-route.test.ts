import { beforeEach, describe, expect, it, vi } from "vitest";

const logoutAction = vi.hoisted(() => vi.fn(async () => ({ ok: true as const, data: null })));
vi.mock("@/modules/core/server/loginAction", () => ({ logoutAction }));

const { POST } = await import("@/app/(staff)/cikis/route");
const route = await import("@/app/(staff)/cikis/route");
const { env } = await import("@/lib/env");

const appOrigin = new URL(env.APP_BASE_URL).origin;
const post = (origin?: string) =>
  new Request(`${appOrigin}/cikis`, {
    method: "POST",
    headers: origin === undefined ? {} : { origin },
  });

describe("POST /cikis", () => {
  beforeEach(() => logoutAction.mockClear());

  it("GET sunulmaz (yalnız POST dışa aktarılır)", () => {
    expect("GET" in route).toBe(false);
  });

  it("Origin yoksa 403 ve çıkış yapılmaz", async () => {
    const res = await POST(post());
    expect(res.status).toBe(403);
    expect(logoutAction).not.toHaveBeenCalled();
  });

  it("farklı Origin 403 döner ve çıkış yapılmaz", async () => {
    for (const origin of ["https://evil.example", "null", `${appOrigin}.evil.example`]) {
      const res = await POST(post(origin));
      expect(res.status).toBe(403);
    }
    expect(logoutAction).not.toHaveBeenCalled();
  });

  it("aynı Origin: logoutAction çağrılır, 303 ile /giris'e yönlenir", async () => {
    const res = await POST(post(appOrigin));
    expect(logoutAction).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(303);
    expect(new URL(res.headers.get("location")!).pathname).toBe("/giris");
  });
});
