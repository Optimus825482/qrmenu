import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Ctx } from "@/lib/auth";

const { canMock, findFirst } = vi.hoisted(() => ({ canMock: vi.fn(), findFirst: vi.fn() }));
vi.mock("@/lib/rbac", () => ({ can: canMock }));
vi.mock("@/lib/prisma", () => ({ prisma: { printer: { findFirst } } }));

import { loadPosShellData } from "../../src/app/(ops)/posShellData";

const ctx = {} as Ctx;
const outlet = { id: "o1", hotelId: "h1", printerId: null, hasMenu: true };

/** Grants exactly the listed screen codes (view access). */
const grant = (...codes: string[]) => canMock.mockImplementation(async (_ctx: Ctx, code: string) => codes.includes(code));

beforeEach(() => {
  canMock.mockReset();
  findFirst.mockReset();
  findFirst.mockResolvedValue(null);
});

describe("loadPosShellData", () => {
  it("QS-KAS yetkisi yoksa kasa null (canUsePos türetmesi), mutfak ayrı kalır", async () => {
    grant("QS-KDS");
    const data = await loadPosShellData(ctx, outlet);
    expect(data.kasa).toBeNull();
    expect(data.kds).not.toBeNull();
    expect(findFirst).not.toHaveBeenCalled();
  });

  it("QS-KAS yetkisi varsa kasa null değildir; yetkisiz ray öğeleri süzülür", async () => {
    grant("QS-KAS");
    const data = await loadPosShellData(ctx, outlet);
    expect(data.kasa).not.toBeNull();
    const ids = data.kasa?.rail.map((item) => item.id);
    expect(ids).toEqual(["tables", "queue", "calls", "menu"]);
    expect(data.kasa?.printer).toEqual({ initial: "unknown", href: "/kasa" });
    expect(data.kds).toBeNull();
  });

  it("QS-FIS ve QS-IPT ile yazıcı ve iptal rayı eklenir", async () => {
    grant("QS-KAS", "QS-FIS", "QS-IPT");
    const data = await loadPosShellData(ctx, { ...outlet, hasMenu: false });
    expect(data.kasa?.rail.map((item) => item.id)).toEqual(["tables", "queue", "calls", "printer", "cancel"]);
    expect(data.kasa?.printer?.href).toBe("/kasa/yazici");
  });
});
