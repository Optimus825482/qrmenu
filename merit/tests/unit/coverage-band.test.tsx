// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MeritEvent } from "@/lib/realtime-events";
import type { CoveredBoard, RoomOrderCard } from "@/modules/order/server/roomService/board";
import type { RoomCardActions, RoomOpsFlags } from "@/modules/order/ui/roomService/RoomOrderCard";

// One subscriber per type list; an event reaches only the lists that include its type (same pattern as room-ops-ui).
const sseSubscribers = new Map<string, { types: readonly string[]; cb: (e: MeritEvent) => void }>();
let sseHandler: ((e: MeritEvent) => void) | null = null;
vi.mock("@/shell/useSse", () => ({
  useSse: (cb: (e: MeritEvent) => void, types: readonly string[] = []) => {
    sseSubscribers.set(types.join(","), { types, cb });
    sseHandler = (e) => {
      for (const sub of sseSubscribers.values()) if (sub.types.includes(e.type)) sub.cb(e);
    };
    return { status: "open" };
  },
}));
vi.mock("@/components/ops/useSound", () => ({ useSound: () => vi.fn() }));

const getCovered = vi.hoisted(() => vi.fn());
vi.mock("@/modules/order/server/actions/roomServiceCoverage", () => ({ getCoveredBoardAction: getCovered }));

const { CoverageBand } = await import("@/modules/order/ui/roomService/CoverageBand");

const NOW = Date.now();
const later = (min: number) => new Date(NOW + min * 60_000);

const flags: RoomOpsFlags = { talepD: true, teyitD: true, teslimD: true, teslimA: true, talepA: true };
const actions: RoomCardActions = {
  approve: vi.fn(),
  confirmPhone: vi.fn(),
  cancel: vi.fn(),
  ready: vi.fn(),
  onWay: vi.fn(),
  delivered: vi.fn(),
};

function card(over: Partial<RoomOrderCard> = {}): RoomOrderCard {
  return {
    id: "o1",
    orderNo: 1,
    roomId: "r1",
    roomNumber: "101",
    extension: "4101",
    status: "GONDERILDI",
    createdAt: new Date(NOW),
    slaStartAt: new Date(NOW),
    slaDueAt: later(25),
    slaState: "OK",
    items: [{ name: "Çay", qty: 2 }],
    guestLanguage: "tr",
    occupancy: "DOLU",
    ...over,
  };
}

const board: CoveredBoard = {
  serverNow: new Date(NOW).toISOString(),
  hotels: [
    {
      hotelId: "h2",
      hotelName: "Royal Diamond",
      hotelCode: "DIAMOND",
      outletId: "outDiamond",
      mode: "ISLEME",
      canProcess: true,
      confirmRequired: false,
      cards: [{ column: "NEW", card: card() }],
    },
  ],
};

const renderBand = () =>
  render(<CoverageBand initial={board} flags={flags} actions={actions} busy={false} refreshKey={0} />);

beforeEach(() => {
  getCovered.mockReset();
  getCovered.mockResolvedValue({ ok: true, data: board });
});
afterEach(cleanup);

describe("CoverageBand SLA canlılığı", () => {
  it("kapsanan otelin order.sla olayı bandı yeniler (kapsam SSE'si)", async () => {
    const { container } = renderBand();
    expect(container.querySelector("[data-testid='coverage-band']")).not.toBeNull();
    getCovered.mockClear();

    await act(async () => {
      sseHandler?.({
        type: "order.sla",
        hotelId: "h2",
        outletId: "outDiamond",
        payload: { orderId: "o1", level: "BREACH", kind: "ODA_SERVISI" },
        at: "",
      });
      await new Promise((r) => setTimeout(r, 250));
    });
    expect(getCovered).toHaveBeenCalledTimes(1);
  });

  it("ilgisiz otelin order.sla olayı bandı yenilemez", async () => {
    renderBand();
    getCovered.mockClear();

    await act(async () => {
      sseHandler?.({ type: "order.sla", hotelId: "h3", outletId: "outOther", payload: { level: "BREACH" }, at: "" });
      await new Promise((r) => setTimeout(r, 250));
    });
    expect(getCovered).not.toHaveBeenCalled();
  });
});
