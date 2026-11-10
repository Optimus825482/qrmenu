import { describe, expect, it, vi } from "vitest";

const call = {
  id: "c1",
  outletId: "o1",
  tableId: "t1",
  resolvedById: "u1",
  resolvedAt: new Date("2026-10-31T10:00:00Z"),
  resolvedBy: { fullName: "Ayşe Kaya" },
};
vi.mock("@/lib/prisma", () => {
  const empty = { findMany: vi.fn(async () => []) };
  const waiterCall = {
    findMany: vi.fn(async (a: { where: Record<string, unknown> }) => ("resolvedAt" in a.where ? [call] : [])),
  };
  return { prisma: { waiterCall, qrScanLog: empty, operationEvent: empty, $queryRaw: vi.fn(async () => []) } };
});

const { tablesSource } = await import("@/modules/radar/server/replay/sources/tables");

async function closedEvent(roleKind: string) {
  const out: Record<string, unknown>[] = [];
  const q = {
    hotelId: "h1",
    from: new Date("2026-10-31T00:00:00Z"),
    to: new Date("2026-10-31T23:00:00Z"),
    day: "2026-10-31",
    fromTime: "00:00",
    toTime: "23:00",
    layers: ["SIPARIS"],
    ctx: { user: { roleKind } },
  };
  for await (const e of tablesSource(q as never)) if (e.type === "call.closed") out.push(e as never);
  return out[0];
}

describe("replay garson adı", () => {
  it("yalnız SISTEM / YONETIM adı görür; diğer roller için ad çıkarılır", async () => {
    expect(await closedEvent("YONETIM")).toMatchObject({ waiterName: "Ayşe Kaya" });
    expect(await closedEvent("SISTEM")).toMatchObject({ waiterName: "Ayşe Kaya" });
    const masked = await closedEvent("OPERASYON");
    expect(masked).toBeDefined();
    expect(masked!.waiterName).toBeUndefined();
  });
});
