// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MeritEvent } from "@/lib/realtime-events";
import type { RoomBoard, RoomBoardColumn, RoomOrderCard } from "@/modules/order/server/roomService/board";
import type { RoomOpsFlags } from "@/modules/order/ui/roomService/RoomOrderCard";

let sseHandler: ((e: MeritEvent) => void) | null = null;
vi.mock("@/shell/useSse", () => ({
  useSse: (cb: (e: MeritEvent) => void) => {
    sseHandler = cb;
    return { status: "open" };
  },
}));
const playNew = vi.hoisted(() => vi.fn());
const playReady = vi.hoisted(() => vi.fn());
const playCall = vi.hoisted(() => vi.fn());
vi.mock("@/components/ops/useSound", () => ({
  useSound: (name: string) => (name === "new-order" ? playNew : name === "ready" ? playReady : playCall),
}));

const getBoard = vi.hoisted(() => vi.fn());
const approve = vi.hoisted(() => vi.fn());
const confirmPhone = vi.hoisted(() => vi.fn());
const cancel = vi.hoisted(() => vi.fn());
const ready = vi.hoisted(() => vi.fn());
const onWay = vi.hoisted(() => vi.fn());
const delivered = vi.hoisted(() => vi.fn());
const setOrdering = vi.hoisted(() => vi.fn());
vi.mock("@/modules/order/server/actions/roomServiceBoard", () => ({ getRoomBoardAction: getBoard }));
vi.mock("@/modules/order/server/actions/roomService", () => ({
  approveRoomOrderAction: approve,
  confirmRoomPhoneAction: confirmPhone,
  cancelRoomOrderAction: cancel,
  markRoomReadyAction: ready,
  markRoomOnWayAction: onWay,
  markRoomDeliveredAction: delivered,
}));
vi.mock("@/modules/menu/server/actions/outletSwitches", () => ({ setOutletOrderingEnabledAction: setOrdering }));

const confirmDialog = vi.hoisted(() => vi.fn());
vi.mock("@/shell/confirm", () => ({ confirm: confirmDialog }));

const requireUser = vi.hoisted(() => vi.fn());
const can = vi.hoisted(() => vi.fn());
const findOutlet = vi.hoisted(() => vi.fn());
const boardGet = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth", () => ({ requireUser }));
vi.mock("@/lib/rbac", () => ({ can }));
vi.mock("@/lib/prisma", () => ({ prisma: { outlet: { findFirst: findOutlet } } }));
vi.mock("@/modules/order/server/roomService/board", () => ({ board: { get: boardGet } }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`);
  },
}));

import OdaServisiClient from "@/app/(ops)/oda-servisi/OdaServisiClient";
import { renderOdaServisi } from "@/app/(ops)/oda-servisi/renderOdaServisi";
import { SlaTimer, formatSlaClock, slaTimerState } from "@/modules/order/ui/roomService/SlaTimer";

const NOW = Date.now();
const min = 60_000;
let seq = 0;

function card(over: Partial<RoomOrderCard> = {}): RoomOrderCard {
  seq += 1;
  return {
    id: `o${seq}`,
    orderNo: seq,
    roomId: `r${seq}`,
    roomNumber: "101",
    extension: "4101",
    status: "GONDERILDI",
    createdAt: new Date(NOW - 5 * min),
    slaStartAt: new Date(NOW - 5 * min),
    slaDueAt: new Date(NOW + 25 * min),
    slaState: "OK",
    items: [{ name: "Çay", qty: 2 }],
    guestLanguage: "tr",
    occupancy: "DOLU",
    ...over,
  };
}

function boardOf(cols: Partial<Record<RoomBoardColumn, RoomOrderCard[]>>, over: Partial<RoomBoard> = {}): RoomBoard {
  return {
    columns: { CONFIRM: [], NEW: [], PREP: [], READY: [], ONWAY: [], ...cols },
    kpis: { open: 0, overdue: 0, today: 0 },
    orderingEnabled: true,
    confirmRequired: false,
    serverNow: new Date().toISOString(),
    ...over,
  };
}

const ALL: RoomOpsFlags = { talepD: true, teyitD: true, teslimD: true, teslimA: true, talepA: true };
const NONE: RoomOpsFlags = { talepD: false, teyitD: false, teslimD: false, teslimA: false, talepA: false };

function ui(b: RoomBoard, flags: RoomOpsFlags, tab: "tumu" | "teyit" | "teslim" = "tumu") {
  return <OdaServisiClient outletId="out1" hotelName="Merit Royal" tab={tab} initialBoard={b} flags={flags} />;
}

function allBoard(): RoomBoard {
  return boardOf({
    NEW: [card({ status: "GONDERILDI" })],
    PREP: [card({ status: "ONAYLANDI" })],
    READY: [card({ status: "HAZIR" })],
    ONWAY: [card({ status: "YOLDA" })],
  });
}

beforeEach(() => {
  seq = 0;
  sseHandler = null;
  getBoard.mockReset();
  getBoard.mockResolvedValue({ ok: true, data: boardOf({}) });
  confirmDialog.mockReset();
  confirmDialog.mockResolvedValue(true);
  for (const fn of [approve, confirmPhone, cancel, ready, onWay, delivered, setOrdering, playNew, playReady, playCall]) {
    fn.mockReset();
  }
  for (const fn of [approve, confirmPhone, cancel, ready, onWay, delivered, setOrdering]) fn.mockResolvedValue({ ok: true, data: {} });
});
afterEach(cleanup);

describe("RoomService staff board - button visibility per permission flag", () => {
  it("full rights show every transition button and the ordering switch", () => {
    render(ui(allBoard(), ALL));
    expect((screen.getByRole("button", { name: "Onayla" }) as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByRole("button", { name: "Hazır" }) as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByRole("button", { name: "Yola çıktı" }) as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByRole("button", { name: "Teslim edildi" }) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.getAllByRole("button", { name: "İptal" }).length).toBe(4);
    expect(screen.getByRole("switch", { name: "Sipariş alımı" })).toBeTruthy();
  });

  it("no rights: no mutation buttons and the ordering state is read-only", () => {
    render(ui(allBoard(), NONE));
    for (const name of ["Onayla", "Hazır", "Yola çıktı", "Teslim edildi", "İptal"]) {
      expect(screen.queryByRole("button", { name })).toBeNull();
    }
    expect(screen.queryByRole("switch")).toBeNull();
    expect(screen.getByTestId("ordering-state").textContent).toBe("Açık");
  });

  it("Yola çıktı / Teslim edildi need RO-TES D only", () => {
    render(ui(allBoard(), { ...NONE, talepD: true }));
    expect(screen.getByRole("button", { name: "Onayla" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Hazır" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Yola çıktı" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Teslim edildi" })).toBeNull();
  });

  it("cancel after approval only with RO-TES A; before approval only with RO-TEL D", () => {
    const { unmount } = render(ui(allBoard(), { ...NONE, teyitD: true }));
    expect(within(document.querySelector('[data-column-id="NEW"]') as HTMLElement).getByRole("button", { name: "İptal" })).toBeTruthy();
    for (const col of ["PREP", "READY", "ONWAY"]) {
      expect(within(document.querySelector(`[data-column-id="${col}"]`) as HTMLElement).queryByRole("button", { name: "İptal" })).toBeNull();
    }
    unmount();
    render(ui(allBoard(), { ...NONE, teslimA: true }));
    expect(within(document.querySelector('[data-column-id="NEW"]') as HTMLElement).queryByRole("button", { name: "İptal" })).toBeNull();
    expect(within(document.querySelector('[data-column-id="PREP"]') as HTMLElement).getByRole("button", { name: "İptal" })).toBeTruthy();
  });

  it("the ordering switch calls setOutletOrderingEnabledAction with the opposite state", async () => {
    render(ui(allBoard(), ALL));
    fireEvent.click(screen.getByRole("switch", { name: "Sipariş alımı" }));
    await waitFor(() => expect(setOrdering).toHaveBeenCalledWith({ id: "out1", enabled: false }));
  });

  it("switching ordering off asks first; declining keeps it on, switching on needs no question", async () => {
    confirmDialog.mockResolvedValueOnce(false);
    const { unmount } = render(ui(allBoard(), ALL));
    fireEvent.click(screen.getByRole("switch", { name: "Sipariş alımı" }));
    await waitFor(() => expect(confirmDialog).toHaveBeenCalledTimes(1));
    expect(confirmDialog.mock.calls[0]?.[0]).toMatchObject({ danger: true });
    expect(setOrdering).not.toHaveBeenCalled();
    unmount();
    render(ui(boardOf({}, { orderingEnabled: false }), ALL));
    fireEvent.click(screen.getByRole("switch", { name: "Sipariş alımı" }));
    await waitFor(() => expect(setOrdering).toHaveBeenCalledWith({ id: "out1", enabled: true }));
    expect(confirmDialog).toHaveBeenCalledTimes(1);
  });

  it("transition buttons call the existing room actions", async () => {
    const full = allBoard();
    getBoard.mockResolvedValue({ ok: true, data: full });
    render(ui(full, ALL));
    fireEvent.click(screen.getByRole("button", { name: "Onayla" }));
    await waitFor(() => expect(approve).toHaveBeenCalledWith({ orderId: "o1" }));
    fireEvent.click(screen.getByRole("button", { name: "Hazır" }));
    await waitFor(() => expect(ready).toHaveBeenCalledWith({ orderId: "o2" }));
    fireEvent.click(screen.getByRole("button", { name: "Yola çıktı" }));
    await waitFor(() => expect(onWay).toHaveBeenCalledWith({ orderId: "o3" }));
    fireEvent.click(screen.getByRole("button", { name: "Teslim edildi" }));
    await waitFor(() => expect(delivered).toHaveBeenCalledWith({ orderId: "o4" }));
  });
});

describe("RoomService staff board - confirmation, labels, order", () => {
  it("Onayla is disabled on a TEYIT card with the hint", () => {
    render(ui(boardOf({ CONFIRM: [card({ status: "TEYIT_BEKLIYOR" })] }, { confirmRequired: true }), ALL));
    expect((screen.getByRole("button", { name: "Onayla" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("Önce telefonla teyit edin")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Telefonla teyit edildi" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("Onayla is disabled on a NEW card when the outlet requires phone confirmation", () => {
    render(ui(boardOf({ NEW: [card()] }, { confirmRequired: true }), ALL));
    expect((screen.getByRole("button", { name: "Onayla" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("a GONDERILDI card of an outlet requiring phone confirmation offers the phone confirmation", async () => {
    render(ui(boardOf({ NEW: [card()] }, { confirmRequired: true }), ALL));
    fireEvent.click(screen.getByRole("button", { name: "Telefonla teyit edildi" }));
    fireEvent.click(screen.getByRole("button", { name: "Teyidi kaydet" }));
    await waitFor(() => expect(confirmPhone).toHaveBeenCalledWith({ orderId: "o1", note: undefined }));
  });

  it("a GONDERILDI card without the phone requirement has no phone confirmation button", () => {
    render(ui(boardOf({ NEW: [card()] }), ALL));
    expect(screen.queryByRole("button", { name: "Telefonla teyit edildi" })).toBeNull();
  });

  it("Telefonla teyit edildi asks for an optional note and confirms", async () => {
    render(ui(boardOf({ CONFIRM: [card({ status: "TEYIT_BEKLIYOR" })] }, { confirmRequired: true }), ALL, "teyit"));
    fireEvent.click(screen.getByRole("button", { name: "Telefonla teyit edildi" }));
    fireEvent.change(screen.getByLabelText("Teyit notu"), { target: { value: "  buz istedi " } });
    fireEvent.click(screen.getByRole("button", { name: "Teyidi kaydet" }));
    await waitFor(() => expect(confirmPhone).toHaveBeenCalledWith({ orderId: "o1", note: "buz istedi" }));
  });

  it("Teyit edilemedi opens the reason dialog and cancels with the reason", async () => {
    render(ui(boardOf({ CONFIRM: [card({ status: "TEYIT_BEKLIYOR" })] }, { confirmRequired: true }), ALL, "teyit"));
    expect(screen.queryByRole("button", { name: "Onayla" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Teyit edilemedi" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Açmadı" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "İptal et" }));
    await waitFor(() => expect(cancel).toHaveBeenCalledWith({ orderId: "o1", reason: "Açmadı" }));
  });

  it("shows 'Dahili tanımlı değil' when the room has no extension", () => {
    render(ui(boardOf({ NEW: [card({ extension: undefined, roomNumber: "102" })] }), ALL));
    expect(screen.getByText("Dahili tanımlı değil")).toBeTruthy();
    expect(screen.queryByText(/Dahili 4101/)).toBeNull();
  });

  it("shows the extension in the card heading", () => {
    render(ui(boardOf({ NEW: [card()] }), ALL));
    expect(screen.getByRole("heading", { name: "#1 · Oda 101 · Dahili 4101" })).toBeTruthy();
  });

  it("shows 'Oda boş görünüyor' only for BOS rooms, plus the language badge", () => {
    render(ui(boardOf({ NEW: [card({ occupancy: "BOS", guestLanguage: "de" }), card({ occupancy: "BILINMIYOR" }), card({ occupancy: "DOLU" })] }), ALL));
    expect(screen.getAllByText("Oda boş görünüyor")).toHaveLength(1);
    expect(screen.getByLabelText("Misafir dili: DE").textContent).toBe("DE");
  });

  it("renders the five columns in order and the cards in the given (slaDueAt) order", () => {
    const urgent = card({ orderNo: 7, slaDueAt: new Date(NOW + min) });
    const later = card({ orderNo: 8, slaDueAt: new Date(NOW + 20 * min) });
    render(ui(boardOf({ NEW: [urgent, later] }), ALL));
    const titles = Array.from(document.querySelectorAll("[data-column-id] > h2")).map((h) => h.firstElementChild?.textContent);
    expect(titles).toEqual(["Teyit", "Yeni", "Hazırlanıyor", "Hazır", "Yolda"]);
    const headings = within(document.querySelector('[data-column-id="NEW"]') as HTMLElement).getAllByRole("heading", { level: 3 });
    expect(headings.map((h) => h.textContent)).toEqual(["#7 · Oda 101 · Dahili 4101", "#8 · Oda 101 · Dahili 4101"]);
  });

  it("tabs filter the columns: teyit shows one, teslim shows Hazır and Yolda", () => {
    const { unmount } = render(ui(allBoard(), ALL, "teyit"));
    expect(document.querySelectorAll("[data-column-id]")).toHaveLength(1);
    unmount();
    render(ui(allBoard(), ALL, "teslim"));
    expect(Array.from(document.querySelectorAll("[data-column-id]")).map((n) => n.getAttribute("data-column-id"))).toEqual(["READY", "ONWAY"]);
  });

  it("shows prices only when the card carries a subtotal", () => {
    render(ui(boardOf({ NEW: [card({ subtotal: "12.50", currency: "EUR" }), card()] }), ALL));
    expect(screen.getAllByText("€12,50")).toHaveLength(1);
  });
});

describe("RoomService staff board - live refresh", () => {
  it("refreshes on an event of its own outlet, ignores other outlets, sounds per event", async () => {
    render(ui(boardOf({}), ALL));
    act(() => sseHandler?.({ type: "order.created", outletId: "other", at: "" }));
    expect(getBoard).not.toHaveBeenCalled();
    act(() => sseHandler?.({ type: "order.created", outletId: "out1", at: "" }));
    await waitFor(() => expect(getBoard).toHaveBeenCalledWith("out1"));
    expect(playNew).toHaveBeenCalledTimes(1);
    act(() => sseHandler?.({ type: "order.ready", outletId: "out1", at: "" }));
    expect(playReady).toHaveBeenCalledTimes(1);
    act(() => sseHandler?.({ type: "order.sla", outletId: "out1", payload: { level: "BREACH" }, at: "" }));
    expect(playCall).toHaveBeenCalledTimes(1);
  });

  it("does not play the ready sound without RO-TES D", () => {
    render(ui(boardOf({}), { ...ALL, teslimD: false }));
    act(() => sseHandler?.({ type: "order.ready", outletId: "out1", at: "" }));
    expect(playReady).not.toHaveBeenCalled();
  });

  it("debounces an event burst into one refresh", async () => {
    render(ui(boardOf({}), ALL));
    act(() => {
      sseHandler?.({ type: "order.approved", outletId: "out1", at: "" });
      sseHandler?.({ type: "order.prep", outletId: "out1", at: "" });
      sseHandler?.({ type: "order.ready", outletId: "out1", at: "" });
    });
    await waitFor(() => expect(getBoard).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 300));
    expect(getBoard).toHaveBeenCalledTimes(1);
  });

  it("refreshes on realtime.resync (any outlet), on becoming visible and on the online event", async () => {
    render(ui(boardOf({}), ALL));
    act(() => sseHandler?.({ type: "realtime.resync", at: "" }));
    await waitFor(() => expect(getBoard).toHaveBeenCalledTimes(1));
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await waitFor(() => expect(getBoard).toHaveBeenCalledTimes(2));
    act(() => {
      window.dispatchEvent(new Event("online"));
    });
    await waitFor(() => expect(getBoard).toHaveBeenCalledTimes(3));
  });

  it("a rejected refresh shows a connection error that the next good refresh clears", async () => {
    render(ui(boardOf({}), ALL));
    getBoard.mockRejectedValueOnce(new Error("offline"));
    act(() => sseHandler?.({ type: "realtime.resync", at: "" }));
    expect(await screen.findByText("Bağlantı hatası: liste yenilenemedi.")).toBeTruthy();
    act(() => sseHandler?.({ type: "realtime.resync", at: "" }));
    await waitFor(() => expect(screen.queryByText("Bağlantı hatası: liste yenilenemedi.")).toBeNull());
  });

  it("a rejected action shows a connection error that a later refresh does not clear", async () => {
    approve.mockRejectedValueOnce(new Error("offline"));
    render(ui(boardOf({ NEW: [card()] }), ALL));
    fireEvent.click(screen.getByRole("button", { name: "Onayla" }));
    expect(await screen.findByText("Bağlantı hatası: işlem gönderilemedi. Tekrar deneyin.")).toBeTruthy();
    act(() => sseHandler?.({ type: "realtime.resync", at: "" }));
    await waitFor(() => expect(getBoard).toHaveBeenCalled());
    expect(screen.getByText("Bağlantı hatası: işlem gönderilemedi. Tekrar deneyin.")).toBeTruthy();
  });

  it("the shown column falls back to the first one of the tab when the remembered one is not in it", () => {
    const { rerender } = render(ui(allBoard(), ALL, "tumu"));
    rerender(ui(allBoard(), ALL, "teslim"));
    const hidden = (col: string) => document.querySelector(`[data-column-id="${col}"]`)?.className.split(" ").includes("hidden");
    expect(hidden("READY")).toBe(false);
    expect(hidden("ONWAY")).toBe(true);
  });

  it("applies the refreshed board", async () => {
    render(ui(boardOf({}), ALL));
    getBoard.mockResolvedValue({ ok: true, data: boardOf({ NEW: [card({ orderNo: 41 })] }) });
    act(() => sseHandler?.({ type: "order.created", outletId: "out1", at: "" }));
    expect(await screen.findByRole("heading", { name: /#41/ })).toBeTruthy();
  });
});

describe("SlaTimer clock offset", () => {
  it("applies the server offset to the device clock and works without one", () => {
    const due = new Date(Date.now() + 10 * min);
    const start = new Date(Date.now() - 5 * min);
    const { unmount } = render(<SlaTimer startAt={start} dueAt={due} />);
    expect(screen.getByRole("timer").textContent).toMatch(/^(09:5\d|10:00)$/);
    unmount();
    // the device clock runs 20 minutes behind the server: the deadline is 10 minutes ahead of the device but 10 behind the server
    render(<SlaTimer startAt={start} dueAt={due} offsetMs={20 * min} />);
    expect(screen.getByRole("timer").textContent).toMatch(/^\+(09:5\d|10:00)$/);
    expect(screen.getByRole("timer").getAttribute("data-sla-state")).toBe("BREACH");
  });
});

describe("SlaTimer helpers", () => {
  it("state follows 80 % warn and 100 % breach", () => {
    expect(slaTimerState(0, 30 * min, 10 * min)).toBe("OK");
    expect(slaTimerState(0, 30 * min, 24 * min)).toBe("WARN");
    expect(slaTimerState(0, 30 * min, 30 * min)).toBe("BREACH");
  });
  it("clock shows remaining and overdue time", () => {
    expect(formatSlaClock(10 * min + 5000, 0)).toBe("10:05");
    expect(formatSlaClock(0, 190_000)).toBe("+03:10");
  });
});

describe("/oda-servisi server page gates", () => {
  const ctxOf = (flags: Record<string, boolean>) => {
    requireUser.mockResolvedValue({ session: { hotelId: "h1" } });
    can.mockImplementation(async (_ctx: unknown, screenCode: string, level: string) => flags[`${screenCode}:${level}`] ?? false);
    findOutlet.mockResolvedValue({ id: "out1", name: "Oda Servisi", hotel: { name: "Merit Royal" } });
    boardGet.mockResolvedValue(boardOf({}));
  };
  beforeEach(() => {
    requireUser.mockReset();
    can.mockReset();
    findOutlet.mockReset();
    boardGet.mockReset();
  });

  it("computes the permission flags on the server", async () => {
    ctxOf({ "RO-TAL:V": true, "RO-TAL:D": true, "RO-TES:D": true, "RO-TES:A": true });
    const el = (await renderOdaServisi(Promise.resolve({}))) as { props: { flags: RoomOpsFlags; tab: string; outletId: string } };
    expect(el.props.flags).toEqual({ talepD: true, teyitD: false, teslimD: true, teslimA: true, talepA: false });
    expect(el.props.tab).toBe("tumu");
    expect(el.props.outletId).toBe("out1");
  });

  it("blocks ?sekme=teyit without RO-TEL V", async () => {
    ctxOf({ "RO-TAL:V": true, "RO-TES:V": true });
    await expect(renderOdaServisi(Promise.resolve({ sekme: "teyit" }))).rejects.toThrow("NEXT_REDIRECT:/yetkisiz?ekran=RO-TEL");
    expect(boardGet).not.toHaveBeenCalled();
  });

  it("blocks ?sekme=teslim without RO-TES V and the default tab without RO-TAL V", async () => {
    ctxOf({ "RO-TAL:V": true, "RO-TEL:V": true });
    await expect(renderOdaServisi(Promise.resolve({ sekme: "teslim" }))).rejects.toThrow("RO-TES");
    ctxOf({ "RO-TEL:V": true });
    await expect(renderOdaServisi(Promise.resolve({}))).rejects.toThrow("NEXT_REDIRECT:/yetkisiz?ekran=RO-TAL");
  });

  it("allows ?sekme=teyit with RO-TEL V (no RO-TAL V needed for the gate)", async () => {
    ctxOf({ "RO-TEL:V": true, "RO-TEL:D": true });
    const el = (await renderOdaServisi(Promise.resolve({ sekme: "teyit" }))) as { props: { tab: string; flags: RoomOpsFlags } };
    expect(el.props.tab).toBe("teyit");
    expect(el.props.flags.teyitD).toBe(true);
  });

  it("has no first-hotel fallback: no session hotel goes to /secim, a hotel without the outlet too", async () => {
    ctxOf({ "RO-TAL:V": true });
    requireUser.mockResolvedValue({ session: { hotelId: null }, hotelIds: ["h9"] });
    await expect(renderOdaServisi(Promise.resolve({}))).rejects.toThrow("NEXT_REDIRECT:/secim");
    ctxOf({ "RO-TAL:V": true });
    findOutlet.mockResolvedValue(null);
    await expect(renderOdaServisi(Promise.resolve({}))).rejects.toThrow("NEXT_REDIRECT:/secim");
  });

  it("a failing board load becomes a loadError instead of a 500", async () => {
    ctxOf({ "RO-TAL:V": true });
    boardGet.mockRejectedValue(new Error("Bu outlete erişiminiz yok"));
    const el = (await renderOdaServisi(Promise.resolve({}))) as { props: { initialBoard: unknown; loadError: string } };
    expect(el.props.initialBoard).toBeNull();
    expect(el.props.loadError).toBe("Bu outlete erişiminiz yok");
  });
});
