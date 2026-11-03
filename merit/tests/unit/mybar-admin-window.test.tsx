// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MeritEvent } from "@/lib/realtime-events";

let sseHandler: ((e: MeritEvent) => void) | undefined;
let sseTypes: readonly string[] | undefined;
vi.mock("@/shell/useSse", () => ({
  useSse: (cb: (e: MeritEvent) => void, types?: readonly string[]) => {
    sseHandler = cb;
    sseTypes = types;
    return { status: "open" };
  },
}));

const listMock = vi.hoisted(() => vi.fn());
const kpisMock = vi.hoisted(() => vi.fn());
const cancelMock = vi.hoisted(() => vi.fn());
const capsMock = vi.hoisted(() => vi.fn());
const exportMock = vi.hoisted(() => vi.fn());
vi.mock("@/modules/mybar/server/actions/requests", () => ({
  listMybarAction: listMock,
  mybarKpisAction: kpisMock,
  cancelMybarAction: cancelMock,
}));
vi.mock("@/modules/mybar/server/actions/admin", () => ({
  mybarCapabilitiesAction: capsMock,
  exportMybarAction: exportMock,
}));

const { MybarRequestsWindow } = await import("@/shell/apps/MybarRequestsWindow");
const { registerMybarApps } = await import("@/modules/mybar/apps");
const { getApp } = await import("@/shell/registry");

const NOW = "2026-11-03T10:00:00.000Z";
const row = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  hotelId: "h1",
  roomId: `r-${id}`,
  roomNumber: `10${id}`,
  floorName: "Kat 1",
  status: "BEKLEMEDE",
  createdAt: NOW,
  language: "tr",
  note: null,
  noteTr: null,
  noteSrcLang: null,
  seenAt: null,
  seenByName: null,
  completedAt: null,
  completedByName: null,
  closeNote: null,
  closedWithMissing: false,
  cancelledAt: null,
  cancelledByName: null,
  cancelNote: null,
  items: [{ productId: "p1", name: "Kola", requestedQty: 2, deliveredQty: 1, remainingQty: 1, poolRemaining: null }],
  ...over,
});
const page = (items: unknown[], total = items.length) => ({
  ok: true as const,
  data: { items, total, page: 1, pageSize: 100 },
});

const props = {
  hotelId: "h1",
  windowId: "w1",
  close: vi.fn(),
  setStatus: vi.fn(),
  setDirty: vi.fn(),
  openApp: vi.fn(),
};

const TWO_WORDS = "İptal edilen MyBar talepleri için en az 3 kelimelik geçerli bir açıklama girmek zorunludur. Bir ya da iki kelimelik açıklamalar kabul edilmez.";

beforeEach(() => {
  sseHandler = undefined;
  listMock.mockReset().mockResolvedValue(page([row("1"), row("2", { status: "IPTAL" })]));
  kpisMock.mockReset().mockResolvedValue({
    ok: true,
    data: { pending: 7, unseen: 3, completedToday: 11, cancelledToday: 2 },
  });
  cancelMock.mockReset().mockResolvedValue({ ok: true, data: undefined });
  capsMock.mockReset().mockResolvedValue({ ok: true, data: { canCancel: true, canExport: true } });
  exportMock.mockReset();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const open = async () => {
  render(<MybarRequestsWindow {...props} />);
  await screen.findByText("101");
};

describe("MyBar Talepleri penceresi", () => {
  it("KPI sayıları mybarKpisAction yanıtından gelir", async () => {
    await open();
    const strip = screen.getByLabelText("Özet");
    expect(within(strip).getByText("7")).toBeTruthy();
    expect(within(strip).getByText("3")).toBeTruthy();
    expect(within(strip).getByText("11")).toBeTruthy();
    expect(within(strip).getByText("2")).toBeTruthy();
    expect(kpisMock).toHaveBeenCalledWith("h1");
  });

  it("durum süzgeci listeyi status:IPTAL ile çağırır, tarih ve sayfa boyutu isteğe girer", async () => {
    await open();
    expect(listMock).toHaveBeenLastCalledWith(expect.objectContaining({ hotelId: "h1", page: 1, pageSize: 100 }));
    fireEvent.change(screen.getByLabelText("Durum"), { target: { value: "IPTAL" } });
    await waitFor(() => expect(listMock).toHaveBeenLastCalledWith(expect.objectContaining({ status: "IPTAL" })));
    fireEvent.change(screen.getByLabelText("Başlangıç tarihi"), { target: { value: "2026-11-01" } });
    await waitFor(() => expect(listMock).toHaveBeenLastCalledWith(expect.objectContaining({ from: "2026-11-01" })));
    fireEvent.change(screen.getByLabelText("Sayfa başına talep"), { target: { value: "200" } });
    await waitFor(() => expect(listMock).toHaveBeenLastCalledWith(expect.objectContaining({ pageSize: 200, page: 1 })));
  });

  it("canCancel=false iken iptal düğmesi DOM'da yoktur; karşılama düğmesi hiçbir durumda yoktur", async () => {
    capsMock.mockResolvedValue({ ok: true, data: { canCancel: false, canExport: false } });
    await open();
    fireEvent.click(screen.getByText("101"));
    await screen.findByLabelText("Talep ayrıntısı");
    expect(screen.queryByRole("button", { name: /iptal et/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /karşıla|ekle/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /CSV/ })).toBeNull();
  });

  it("2 kelimelik açıklama uyarı gösterir ve eylem çağrılmaz; 3 kelimeyle iptal edilir ve liste yenilenir", async () => {
    await open();
    fireEvent.click(screen.getByText("101"));
    fireEvent.click(await screen.findByRole("button", { name: "Talebi iptal et" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Diğer sebep"), { target: { value: "kısa açıklama" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "İptal et" }));
    await waitFor(() => expect(within(dialog).getByText(TWO_WORDS)).toBeTruthy());
    expect(cancelMock).not.toHaveBeenCalled();

    const callsBefore = listMock.mock.calls.length;
    fireEvent.change(within(dialog).getByLabelText("Diğer sebep"), { target: { value: "misafir odadan ayrıldı" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "İptal et" }));
    await waitFor(() => expect(cancelMock).toHaveBeenCalledWith("1", { reason: "misafir odadan ayrıldı" }));
    await waitFor(() => expect(listMock.mock.calls.length).toBeGreaterThan(callsBefore));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("mybar.created olayı satır sayısını bir artırır; başka otelin olayı yenilemez", async () => {
    await open();
    expect(sseTypes).toContain("mybar.created");
    expect(screen.getAllByRole("row")).toHaveLength(3);
    listMock.mockResolvedValue(page([row("3"), row("1"), row("2", { status: "IPTAL" })]));
    vi.useFakeTimers();
    const base = { type: "mybar.created", payload: {}, at: NOW } as const;
    act(() => sseHandler?.({ ...base, hotelId: "h2" } as MeritEvent));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });
    expect(screen.getAllByRole("row")).toHaveLength(3);
    act(() => sseHandler?.({ ...base, hotelId: "h1" } as MeritEvent));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });
    vi.useRealTimers();
    await waitFor(() => expect(screen.getAllByRole("row")).toHaveLength(4));
  });

  it("detay paneli ürünleri istenen/eklenen olarak salt okunur gösterir", async () => {
    await open();
    fireEvent.click(screen.getByText("101"));
    const detail = await screen.findByLabelText("Talep ayrıntısı");
    expect(within(detail).getByText("Kola")).toBeTruthy();
    expect(within(detail).getByRole("table", { name: "Ürünler" })).toBeTruthy();
  });

  it("dışa aktarma süzgeçleri ve biçimi sunucu eylemine iletir", async () => {
    exportMock.mockResolvedValue({
      ok: true,
      data: { filename: "x.csv", mime: "text/csv", base64: btoa("a;b"), rows: 1 },
    });
    URL.createObjectURL = vi.fn(() => "blob:x");
    URL.revokeObjectURL = vi.fn();
    await open();
    fireEvent.change(screen.getByLabelText("Durum"), { target: { value: "TAMAMLANDI" } });
    await waitFor(() => expect(listMock).toHaveBeenLastCalledWith(expect.objectContaining({ status: "TAMAMLANDI" })));
    fireEvent.click(screen.getByRole("button", { name: /Excel/ }));
    await waitFor(() =>
      expect(exportMock).toHaveBeenCalledWith(expect.objectContaining({ hotelId: "h1", status: "TAMAMLANDI", format: "xlsx" })),
    );
  });
});

describe("kayıt", () => {
  it("registerMybarApps: MB-PERS ekranına bağlı MINIBAR uygulaması", () => {
    registerMybarApps();
    const app = getApp("minibar.mybar");
    expect(app?.screenCode).toBe("MB-PERS");
    expect(app?.icon).toBe("mybar");
    expect(app?.needsHotel).toBe(true);
    expect(app?.window).toMatchObject({ w: 980, h: 600 });
  });
});
