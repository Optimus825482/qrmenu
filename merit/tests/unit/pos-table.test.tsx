// @vitest-environment jsdom
import type { ComponentProps } from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import TableBoard, { type BoardTable } from "@/app/(ops)/kasa/TableBoard";
import TablePanel, { type PanelOrder } from "@/app/(ops)/kasa/TablePanel";

afterEach(cleanup);

const table = (over: Partial<BoardTable> = {}): BoardTable => ({
  id: "t1",
  label: "M1",
  areaId: "a1",
  areaLabel: "Teras",
  isActive: true,
  openOrders: [],
  openCalls: 0,
  ...over,
});

describe("TableBoard kartı", () => {
  it("garsonsuz masada kesik çizgili 'Atanmadı', onay bekleyen sipariş tonu ve rozet", () => {
    const onSelect = vi.fn();
    const t = table({ openOrders: [{ id: "o1", orderNo: 7, status: "GONDERILDI", ageSec: 30, totalPrice: 12 }] });
    render(<TableBoard tables={[t]} calls={[]} currency="EUR" onSelect={onSelect} />);
    const tile = screen.getByRole("button", { name: /^M1 masa detayları/ });
    expect(tile.textContent).toContain("Atanmadı");
    expect(tile.textContent).toContain("Onay bekliyor · 1");
    expect(tile.textContent).toContain("12,00");
    expect(tile.getAttribute("data-tone")).toBe("pending");
    expect(tile.className).toContain("tone-thick");
    expect(tile.getAttribute("title")).toBeNull();
    fireEvent.click(tile);
    expect(onSelect).toHaveBeenCalledWith(t);
  });

  it("garson adı varsa gösterilir; boş masa 'Boş'", () => {
    render(<TableBoard tables={[table({ waiter: { id: "w", fullName: "Ayşe" } })]} calls={[]} currency="EUR" onSelect={() => {}} />);
    const tile = screen.getByRole("button", { name: /^M1 masa detayları/ });
    expect(tile.textContent).toContain("Ayşe");
    expect(tile.textContent).toContain("Boş");
  });

  it("çağrı rozeti saniye sayacıyla; 60 sn ve üstü gecikmiş kenar sınıfı", () => {
    const { rerender } = render(<TableBoard tables={[table({ openCalls: 1 })]} calls={[{ tableLabel: "M1", ageSec: 45, type: "GARSON" }]} currency="EUR" onSelect={() => {}} />);
    let tile = screen.getByRole("button", { name: /^M1 masa detayları/ });
    expect(tile.textContent).toContain("GARSON");
    expect(tile.textContent).toContain("0:45");
    expect(tile.className).not.toContain("call-overdue");
    rerender(<TableBoard tables={[table({ openCalls: 1 })]} calls={[{ tableLabel: "M1", ageSec: 75, type: "GARSON" }]} currency="EUR" onSelect={() => {}} />);
    tile = screen.getByRole("button", { name: /^M1 masa detayları/ });
    expect(tile.textContent).toContain("1:15");
    expect(tile.className).toContain("call-overdue");
  });

  it("ızgara minmax(120px, 1fr) ve aralık 12 px", () => {
    const { container } = render(<TableBoard tables={[table()]} calls={[]} currency="EUR" onSelect={() => {}} />);
    const grid = container.querySelector<HTMLElement>("[style*='grid-template-columns']")!;
    expect(grid.style.gridTemplateColumns).toBe("repeat(auto-fill, minmax(120px, 1fr))");
    expect(grid.style.gap).toBe("12px");
  });
});

const order = (over: Partial<PanelOrder> = {}): PanelOrder => ({
  id: "o1",
  orderNo: 12,
  status: "GONDERILDI",
  createdAt: new Date().toISOString(),
  note: null,
  pricesShown: true,
  canApprove: true,
  items: [{ id: "i1", name: "Mojito", qty: 2, unitPrice: 6 }],
  ...over,
});

function panel(over: Partial<ComponentProps<typeof TablePanel>> = {}) {
  const handlers = { onClose: vi.fn(), onApprove: vi.fn(), onReject: vi.fn(), onReprint: vi.fn(), onResolveCall: vi.fn(), onAssign: vi.fn(), onCreateOrder: vi.fn() };
  render(
    <TablePanel
      table={table({ waiter: { id: "w1", fullName: "Ayşe" } })}
      orders={[order()]}
      calls={[]}
      waiters={[{ id: "w1", fullName: "Ayşe" }, { id: "w2", fullName: "Mehmet" }]}
      capabilities={{ approve: true, assign: true, reprint: true, createOrder: false }}
      currency="EUR"
      pricesShown
      layout="side"
      {...handlers}
      {...over}
    />,
  );
  return handlers;
}

describe("TablePanel", () => {
  it("sipariş #N, kalemler ve Onayla; tek dokunuşla onay çağrılır", () => {
    const h = panel();
    const card = screen.getByRole("article", { name: "Sipariş #12" });
    expect(card.textContent).toContain("2 × Mojito");
    expect(card.textContent).toContain("12,00");
    fireEvent.click(within(card).getByRole("button", { name: "Onayla" }));
    expect(h.onApprove).toHaveBeenCalledTimes(1);
    expect(h.onApprove.mock.calls[0][0].id).toBe("o1");
  });

  it("Reddet düğmesi sebep akışını tetikler", () => {
    const h = panel();
    fireEvent.click(screen.getByRole("button", { name: "Reddet" }));
    expect(h.onReject).toHaveBeenCalledTimes(1);
  });

  it("yetkisizse Onayla/Reddet yok; onaylı siparişte Fiş yeniden bas yetkiye bağlı", () => {
    panel({ capabilities: { approve: false, assign: false, reprint: false, createOrder: false } });
    expect(screen.queryByRole("button", { name: "Onayla" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Değiştir" })).toBeNull();
    cleanup();
    const h = panel({ orders: [order({ status: "ONAYLANDI", canApprove: false })] });
    expect(screen.queryByRole("button", { name: "Onayla" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Fiş yeniden bas" }));
    expect(h.onReprint).toHaveBeenCalledTimes(1);
  });

  it("sipariş onay yetkisi olmayan kullanıcıda (canApprove=false) Onayla görünmez", () => {
    panel({ orders: [order({ canApprove: false })] });
    expect(screen.queryByRole("button", { name: "Onayla" })).toBeNull();
  });

  it("garson değiştirme: combobox 'Garson' + Ata / Atamayı kaldır", () => {
    const h = panel();
    fireEvent.click(screen.getByRole("button", { name: "Değiştir" }));
    fireEvent.change(screen.getByRole("combobox", { name: "Garson" }), { target: { value: "w2" } });
    fireEvent.click(screen.getByRole("button", { name: "Ata" }));
    expect(h.onAssign).toHaveBeenCalledWith("w2");
    fireEvent.click(screen.getByRole("button", { name: "Değiştir" }));
    fireEvent.click(screen.getByRole("button", { name: "Atamayı kaldır" }));
    expect(h.onAssign).toHaveBeenLastCalledWith(null);
  });

  it("çağrılar Yanıtla; Yeni adisyon yalnız createOrder ile", () => {
    const h = panel({ calls: [{ id: "c1", type: "HESAP", note: null, ageSec: 5 }], capabilities: { approve: true, assign: true, reprint: true, createOrder: true } });
    fireEvent.click(screen.getByRole("button", { name: "Yanıtla" }));
    expect(h.onResolveCall).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Yeni adisyon" }));
    expect(h.onCreateOrder).toHaveBeenCalledTimes(1);
  });

  it("boş masada açık sipariş yok metni; sheet düzeninde dialog rolü", () => {
    panel({ orders: [], layout: "sheet" });
    expect(screen.getByText("Bu masada açık sipariş yok.")).toBeTruthy();
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("fiyat gösterimi kapalıysa tutar yazılmaz", () => {
    panel({ pricesShown: false });
    expect(screen.getByRole("article", { name: "Sipariş #12" }).textContent).not.toContain("12,00");
  });
});
