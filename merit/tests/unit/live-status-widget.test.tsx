// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const kpis = {
  hotels: 2,
  onlineUsers: 5,
  radar: {
    occupancyPercent: 60,
    occupiedRooms: 30,
    totalRooms: 50,
    byHotel: [
      { hotelId: "h1", code: "ROYAL", name: "Merit Royal", online: 3, occupancyPercent: 50, occupiedRooms: 10, totalRooms: 20 },
      { hotelId: "h2", code: "DIAMOND", name: "Merit Diamond", online: 2, occupancyPercent: 66, occupiedRooms: 20, totalRooms: 30 },
    ],
  },
};
const live = {
  hotels: [],
  rows: [
    { key: "roomService", label: "Oda servisi talebi", legend: "alınan / tamamlanan / bekleyen", pendingIndex: 2, byHotel: { h1: [12, 9, 3], h2: [4, 4, 0] }, total: [16, 13, 3] },
    { key: "qrOrders", label: "QR sipariş", legend: "alınan / tamamlanan / bekleyen", pendingIndex: 2, byHotel: { h1: [2, 1, 1], h2: null }, total: [2, 1, 1] },
    { key: "waiterCalls", label: "Garson çağrısı", legend: "alınan / bekleyen", pendingIndex: 1, byHotel: { h1: [3, 0], h2: [1, 0] }, total: [4, 0] },
  ],
};

vi.mock("@/shell/useCommandCenterKpis", () => ({ useCommandCenterKpis: () => ({ kpis, error: null, scheduleRefresh: () => {} }), affectsKpis: () => false }));
vi.mock("@/shell/useLiveStatus", () => ({
  useLiveStatus: () => ({ status: live, error: null, scheduleRefresh: () => {} }),
  affectsLiveStatus: () => false,
  LIVE_STATUS_EVENT_TYPES: ["order.created"],
}));
vi.mock("@/shell/useSse", () => ({ useSse: () => ({ status: "open" }) }));
vi.mock("@/shell/windowStore", () => ({ useWindowStore: () => null }));

const { LiveStatusWidget } = await import("@/shell/components/widgets/LiveStatusWidget");

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("LiveStatusWidget", () => {
  it("üç değerli hücreler, '–' ve toplam sütunu; bekleyen > 0 vurgulanır", () => {
    render(<LiveStatusWidget />);
    const row = screen.getByText("Oda servisi talebi").closest("tr")!;
    const cells = [...row.querySelectorAll("td")];
    expect(cells.map((c) => c.textContent)).toEqual(["12 / 9 / 3", "4 / 4 / 0", "16 / 13 / 3"]);
    expect(cells[0]!.hasAttribute("data-warn")).toBe(true);
    expect(cells[1]!.hasAttribute("data-warn")).toBe(false);

    const qr = screen.getByText("QR sipariş").closest("tr")!;
    expect([...qr.querySelectorAll("td")].map((c) => c.textContent)).toEqual(["2 / 1 / 1", "–", "2 / 1 / 1"]);
    expect(document.querySelector(".xp-widget-status-legend")!.textContent).toMatch(/alınan \/ tamamlanan \/ bekleyen/);
    expect(screen.getByText("Çevrimiçi kullanıcı")).toBeTruthy();
  });

  it("oklar otel sütunlarını soldan birer birer toplama katlar ve geri açar; seçim hatırlanır", () => {
    const view = render(<LiveStatusWidget />);
    const cells = () => [...screen.getByText("Oda servisi talebi").closest("tr")!.querySelectorAll("td")].map((c) => c.textContent);
    const heads = () => [...document.querySelectorAll("thead th")].map((c) => c.textContent);
    const foldBtn = () => screen.getByRole("button", { name: "Bir otel sütununu toplama katla" }) as HTMLButtonElement;
    const openBtn = () => screen.getByRole("button", { name: "Bir otel sütunu daha göster" }) as HTMLButtonElement;
    expect(openBtn().disabled).toBe(true);

    fireEvent.click(foldBtn());
    expect(heads()).toEqual(["Diamond", "Toplam"]);
    expect(cells()).toEqual(["4 / 4 / 0", "16 / 13 / 3"]);

    fireEvent.click(foldBtn());
    expect(heads()).toEqual(["Toplam"]);
    expect(cells()).toEqual(["16 / 13 / 3"]);
    expect(foldBtn().disabled).toBe(true);

    // The choice survives a remount (kept in the browser).
    view.unmount();
    render(<LiveStatusWidget />);
    expect(heads()).toEqual(["Toplam"]);

    fireEvent.click(openBtn());
    fireEvent.click(openBtn());
    expect(heads()).toEqual(["Royal", "Diamond", "Toplam"]);
  });
});
