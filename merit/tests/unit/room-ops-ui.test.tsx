// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MeritEvent } from "@/lib/realtime-events";
import type { RoomBoard, RoomBoardColumn, RoomOrderCard } from "@/modules/order/server/roomService/board";
import type { RoomOpsFlags } from "@/modules/order/ui/roomService/RoomOrderCard";

// One subscriber per type list (the board and its MyBar panel each have one); an event reaches those that listen for its type.
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
const playNew = vi.hoisted(() => vi.fn());
const playReady = vi.hoisted(() => vi.fn());
const playCall = vi.hoisted(() => vi.fn());
vi.mock("@/components/ops/useSound", () => ({
  useSound: (name: string) => (name === "new-order" ? playNew : name === "ready" ? playReady : playCall),
}));

const getBoard = vi.hoisted(() => vi.fn());
const approve = vi.hoisted(() => vi.fn());
const cancel = vi.hoisted(() => vi.fn());
const ready = vi.hoisted(() => vi.fn());
const onWay = vi.hoisted(() => vi.fn());
const delivered = vi.hoisted(() => vi.fn());
const setOrdering = vi.hoisted(() => vi.fn());
vi.mock("@/modules/order/server/actions/roomServiceBoard", () => ({ getRoomBoardAction: getBoard }));
vi.mock("@/modules/order/server/actions/roomService", () => ({
  approveRoomOrderAction: approve,
  cancelRoomOrderAction: cancel,
  markRoomReadyAction: ready,
  markRoomOnWayAction: onWay,
  markRoomDeliveredAction: delivered,
}));
vi.mock("@/modules/menu/server/actions/outletSwitches", () => ({ setOutletOrderingEnabledAction: setOrdering }));
const listMybar = vi.hoisted(() => vi.fn());
vi.mock("@/modules/mybar/server/actions/requests", () => ({ listMybarAction: listMybar }));

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
import { byRequestTime, queueOf, stageOfColumn } from "@/modules/order/ui/roomService/stages";

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
    columns: { NEW: [], PREP: [], READY: [], ONWAY: [], ...cols },
    kpis: { open: 0, overdue: 0, today: 0 },
    orderingEnabled: true,
    serverNow: new Date().toISOString(),
    ...over,
  };
}

const ALL: RoomOpsFlags = { talepD: true, teslimD: true, teslimA: true, talepA: true };
const NONE: RoomOpsFlags = { talepD: false, teslimD: false, teslimA: false, talepA: false };

// Most cases read the side-by-side board; the queue (the default the staff sees) has its own cases.
function ui(
  b: RoomBoard,
  flags: RoomOpsFlags,
  tab: "tumu" | "teslim" = "tumu",
  showMybar = false,
  view: "pano" | "kuyruk" | "default" = "pano",
) {
  return <OdaServisiClient outletId="out1" hotelName="Merit Royal" tab={tab} initialBoard={b} flags={flags} showMybar={showMybar} initialView={view === "default" ? undefined : view} />;
}

function mybarRow(over: Record<string, unknown> = {}) {
  return {
    id: "m1",
    roomNumber: "305",
    floorName: "3. Kat",
    createdAt: new Date(NOW - 3 * min),
    seenAt: null,
    seenByName: null,
    note: null,
    noteTr: null,
    items: [{ productId: "p1", name: "Su", requestedQty: 2, deliveredQty: 0, remainingQty: 2, poolRemaining: null }],
    removals: [],
    ...over,
  };
}
const mybarPage = (items: unknown[]) => ({ ok: true, data: { items, total: items.length, page: 1, pageSize: 50 } });

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
  sseSubscribers.clear();
  getBoard.mockReset();
  getBoard.mockResolvedValue({ ok: true, data: boardOf({}) });
  confirmDialog.mockReset();
  confirmDialog.mockResolvedValue(true);
  listMybar.mockReset();
  listMybar.mockResolvedValue(mybarPage([]));
  window.localStorage.clear();
  for (const fn of [approve, cancel, ready, onWay, delivered, setOrdering, playNew, playReady, playCall]) {
    fn.mockReset();
  }
  for (const fn of [approve, cancel, ready, onWay, delivered, setOrdering]) fn.mockResolvedValue({ ok: true, data: {} });
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

  it("cancel after approval only with RO-TES A; before approval only with RO-TAL D", () => {
    const { unmount } = render(ui(allBoard(), { ...NONE, talepD: true }));
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

describe("RoomService staff board - approval, labels, order", () => {
  it("a NEW card has an enabled Onayla and no phone confirmation step", () => {
    render(ui(boardOf({ NEW: [card()] }), ALL));
    expect((screen.getByRole("button", { name: "Onayla" }) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.queryByText(/teyit/i)).toBeNull();
  });

  it("İptal before approval opens the reason dialog and cancels with the reason", async () => {
    render(ui(boardOf({ NEW: [card()] }), ALL));
    fireEvent.click(screen.getByRole("button", { name: "İptal" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Misafir vazgeçti" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "İptal et" }));
    await waitFor(() => expect(cancel).toHaveBeenCalledWith({ orderId: "o1", reason: "Misafir vazgeçti" }));
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

  it("renders the four stages in order and the cards of a stage in request-time order", () => {
    const later = card({ orderNo: 8, createdAt: new Date(NOW - 2 * min) });
    const earlier = card({ orderNo: 7, createdAt: new Date(NOW - 9 * min) });
    render(ui(boardOf({ NEW: [later, earlier] }), ALL));
    const titles = Array.from(document.querySelectorAll("[data-stage-id] > h2")).map((h) => h.firstElementChild?.textContent);
    expect(titles).toEqual(["Talep Alındı", "Hazırlanıyor", "Gönderildi", "Teslim Edildi"]);
    const headings = within(document.querySelector('[data-stage-id="ALINDI"]') as HTMLElement).getAllByRole("heading", { level: 3 });
    expect(headings.map((h) => h.textContent)).toEqual(["#7 · Oda 101 · Dahili 4101", "#8 · Oda 101 · Dahili 4101"]);
  });

  it("folds Hazırlanıyor + Hazır into one stage, with a step badge per card", () => {
    render(ui(boardOf({ NEW: [card()], PREP: [card()], READY: [card()], ONWAY: [card()] }), ALL));
    const steps = (stage: string) =>
      Array.from(document.querySelectorAll(`[data-stage-id="${stage}"] [data-step]`)).map((n) => n.textContent);
    expect(steps("ALINDI")).toEqual([]);
    expect(steps("HAZIRLANIYOR").sort()).toEqual(["Hazır", "Hazırlanıyor"]);
    // one step in the stage: the column title already says it
    expect(steps("GONDERILDI")).toEqual([]);
  });

  it("the Teslim Edildi stage lists today's delivered orders read-only", () => {
    const b = boardOf({}, { delivered: [{ id: "d1", orderNo: 90, roomNumber: "404", deliveredAt: new Date(NOW), items: [{ name: "Çay", qty: 2 }] }] });
    render(ui(b, ALL));
    const stage = within(document.querySelector('[data-stage-id="TESLIM"]') as HTMLElement);
    expect(stage.getByText("#90 · Oda 404")).toBeTruthy();
    expect(stage.getByText("2× Çay")).toBeTruthy();
    expect(stage.queryByRole("button")).toBeNull();
  });

  it("the teslim tab shows Hazır and Yolda only, without the view switch", () => {
    render(ui(allBoard(), ALL, "teslim"));
    expect(screen.queryByRole("group", { name: "Görünüm" })).toBeNull();
    expect(Array.from(document.querySelectorAll("[data-stage-id]")).map((n) => n.getAttribute("data-stage-id"))).toEqual(["READY", "ONWAY"]);
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
    const hidden = (col: string) => document.querySelector(`[data-stage-id="${col}"]`)?.className.split(" ").includes("hidden");
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

describe("RoomService staff board - service queue", () => {
  it("queue rule: the earliest request comes first, the order number breaks a tie", () => {
    const a = card({ orderNo: 3, createdAt: new Date(NOW - 2 * min) });
    const b = card({ orderNo: 2, createdAt: new Date(NOW - 8 * min), status: "YOLDA" });
    const c = card({ orderNo: 1, createdAt: new Date(NOW - 2 * min), status: "ONAYLANDI" });
    const queue = queueOf(boardOf({ NEW: [a], ONWAY: [b], PREP: [c] }));
    expect(queue.map((e) => e.card.orderNo)).toEqual([2, 1, 3]);
    expect(queue.map((e) => e.column)).toEqual(["ONWAY", "PREP", "NEW"]);
    expect(byRequestTime(queue[0], queue[1])).toBeLessThan(0);
    expect(stageOfColumn("READY")).toBe("HAZIRLANIYOR");
    expect(stageOfColumn("NEW")).toBe("ALINDI");
  });

  it("Kuyruk shows every open order as one numbered list and keeps the step buttons", async () => {
    const first = card({ orderNo: 5, createdAt: new Date(NOW - 20 * min), status: "HAZIR" });
    const second = card({ orderNo: 6, createdAt: new Date(NOW - 4 * min) });
    const b = boardOf({ NEW: [second], READY: [first] });
    getBoard.mockResolvedValue({ ok: true, data: b });
    render(ui(b, ALL));
    fireEvent.click(screen.getByRole("button", { name: "Kuyruk" }));
    expect(Array.from(document.querySelectorAll("[data-stage-id]")).map((n) => n.getAttribute("data-stage-id"))).toEqual(["KUYRUK"]);
    const queue = within(document.querySelector('[data-stage-id="KUYRUK"]') as HTMLElement);
    expect(queue.getAllByRole("heading", { level: 3 }).map((h) => h.textContent?.slice(0, 2))).toEqual(["#5", "#6"]);
    expect(queue.getByLabelText("Kuyruk sırası 1")).toBeTruthy();
    expect(queue.getByLabelText("Kuyruk sırası 2")).toBeTruthy();
    fireEvent.click(queue.getByRole("button", { name: "Yola çıktı" }));
    await waitFor(() => expect(onWay).toHaveBeenCalledWith({ orderId: first.id }));
  });

  it("opens in the queue by default; a remembered side-by-side choice wins", async () => {
    const { unmount } = render(ui(allBoard(), ALL, "tumu", false, "default"));
    expect(document.querySelector('[data-stage-id="KUYRUK"]')).toBeTruthy();
    expect(screen.getByRole("button", { name: "Kuyruk" }).getAttribute("aria-pressed")).toBe("true");
    unmount();
    window.localStorage.setItem("merit.rs.view", "pano");
    render(ui(allBoard(), ALL, "tumu", false, "default"));
    await waitFor(() => expect(document.querySelector('[data-stage-id="ALINDI"]')).toBeTruthy());
  });

  it("remembers the chosen view on the device", async () => {
    const { unmount } = render(ui(allBoard(), ALL));
    fireEvent.click(screen.getByRole("button", { name: "Kuyruk" }));
    expect(window.localStorage.getItem("merit.rs.view")).toBe("kuyruk");
    unmount();
    render(ui(allBoard(), ALL));
    await waitFor(() => expect(document.querySelector('[data-stage-id="KUYRUK"]')).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Yan yana" }));
    expect(document.querySelector('[data-stage-id="ALINDI"]')).toBeTruthy();
  });
});

describe("RoomService staff board - notification window", () => {
  const notices = () => within(screen.getByRole("region", { name: "Yeni talep bildirimleri" }));

  it("orders already on the board are not announced; one that arrives later is", async () => {
    const old = card({ orderNo: 10 });
    render(ui(boardOf({ NEW: [old] }), ALL));
    expect(notices().queryByRole("button", { name: "Göster" })).toBeNull();
    const fresh = card({ orderNo: 11, roomNumber: "512", items: [{ name: "Çay", qty: 2 }, { name: "Kek", qty: 1 }] });
    getBoard.mockResolvedValue({ ok: true, data: boardOf({ NEW: [old, fresh] }) });
    act(() => sseHandler?.({ type: "order.created", outletId: "out1", at: "" }));
    expect(await notices().findByText("Yeni oda servisi talebi · Oda 512")).toBeTruthy();
    expect(notices().getByText(/^#11 · 3 ürün · /)).toBeTruthy();
    expect(notices().getAllByRole("button", { name: "Göster" })).toHaveLength(1);
  });

  it("Kapat removes the notice; Göster removes it and highlights the card", async () => {
    render(ui(boardOf({}), ALL));
    const a = card({ orderNo: 21 });
    const b = card({ orderNo: 22 });
    getBoard.mockResolvedValue({ ok: true, data: boardOf({ NEW: [a, b] }) });
    act(() => sseHandler?.({ type: "order.created", outletId: "out1", at: "" }));
    await waitFor(() => expect(notices().getAllByRole("button", { name: "Kapat" })).toHaveLength(2));
    fireEvent.click(notices().getAllByRole("button", { name: "Kapat" })[0]);
    expect(notices().getAllByRole("button", { name: "Göster" })).toHaveLength(1);
    fireEvent.click(notices().getByRole("button", { name: "Göster" }));
    expect(notices().queryByRole("button", { name: "Göster" })).toBeNull();
    expect(document.querySelector(`[data-order-id="${b.id}"]`)?.className).toContain("outline-accent");
    expect(document.querySelector(`[data-order-id="${a.id}"]`)?.className).not.toContain("outline-accent");
  });

  it("a notice disappears by itself once the request is handled", async () => {
    render(ui(boardOf({}), ALL));
    const a = card({ orderNo: 31 });
    getBoard.mockResolvedValue({ ok: true, data: boardOf({ NEW: [a] }) });
    act(() => sseHandler?.({ type: "order.created", outletId: "out1", at: "" }));
    await notices().findByRole("button", { name: "Göster" });
    getBoard.mockResolvedValue({ ok: true, data: boardOf({ PREP: [{ ...a, status: "ONAYLANDI" }] }) });
    act(() => sseHandler?.({ type: "order.approved", outletId: "out1", at: "" }));
    await waitFor(() => expect(notices().queryByRole("button", { name: "Göster" })).toBeNull());
  });

  it("the delivery tab announces no new requests", async () => {
    render(ui(boardOf({}), ALL, "teslim"));
    getBoard.mockResolvedValue({ ok: true, data: boardOf({ NEW: [card()] }) });
    act(() => sseHandler?.({ type: "order.created", outletId: "out1", at: "" }));
    await waitFor(() => expect(getBoard).toHaveBeenCalled());
    expect(notices().queryByRole("button", { name: "Göster" })).toBeNull();
  });
});

describe("RoomService staff board - MyBar panel", () => {
  it("is absent without the MyBar permission and on the other tabs", () => {
    const { unmount } = render(ui(allBoard(), ALL));
    expect(document.querySelector('[data-stage-id="MYBAR"]')).toBeNull();
    unmount();
    render(ui(allBoard(), ALL, "teslim", true));
    expect(document.querySelector('[data-stage-id="MYBAR"]')).toBeNull();
    expect(listMybar).not.toHaveBeenCalled();
  });

  it("lists the pending requests read-only, oldest first", async () => {
    listMybar.mockResolvedValue(
      mybarPage([mybarRow({ id: "m2", roomNumber: "410", createdAt: new Date(NOW - min) }), mybarRow({ seenAt: new Date(NOW), seenByName: "Ayşe" })]),
    );
    render(ui(allBoard(), ALL, "tumu", true));
    const panel = within(document.querySelector('[data-stage-id="MYBAR"]') as HTMLElement);
    expect(await panel.findByText("Oda 305")).toBeTruthy();
    expect(listMybar).toHaveBeenCalledWith({ view: "management", status: "BEKLEMEDE", page: 1, pageSize: 50 });
    expect(Array.from(document.querySelectorAll("[data-mybar-id]")).map((n) => n.getAttribute("data-mybar-id"))).toEqual(["m1", "m2"]);
    expect(panel.getByText("Görüldü · Ayşe")).toBeTruthy();
    expect(panel.getByText("Kat ekibi henüz görmedi")).toBeTruthy();
    expect(panel.queryByRole("button")).toBeNull();
  });

  it("a new MyBar request plays its own sound and opens a notice; the first load does not", async () => {
    listMybar.mockResolvedValue(mybarPage([mybarRow()]));
    render(ui(boardOf({}), ALL, "tumu", true));
    await screen.findByText("Oda 305");
    const region = within(screen.getByRole("region", { name: "Yeni talep bildirimleri" }));
    expect(region.queryByRole("button", { name: "Göster" })).toBeNull();
    listMybar.mockResolvedValue(mybarPage([mybarRow(), mybarRow({ id: "m9", roomNumber: "777" })]));
    playCall.mockClear();
    act(() => sseHandler?.({ type: "mybar.created", hotelId: "h1", at: "" }));
    expect(await region.findByText("Yeni MyBar talebi · Oda 777")).toBeTruthy();
    // the sound mock returns `playCall` for every name but new-order / ready
    expect(playCall).toHaveBeenCalledTimes(1);
    fireEvent.click(region.getByRole("button", { name: "Göster" }));
    expect(document.querySelector('[data-mybar-id="m9"]')?.className).toContain("outline-accent");
  });

  it("shows the load error instead of an empty list", async () => {
    listMybar.mockResolvedValue({ ok: false, error: { message: "Yetkiniz yok" } });
    render(ui(boardOf({}), ALL, "tumu", true));
    expect(await screen.findByText("Yetkiniz yok")).toBeTruthy();
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
    expect(el.props.flags).toEqual({ talepD: true, teslimD: true, teslimA: true, talepA: false });
    expect((el.props as { showMybar?: boolean }).showMybar).toBe(false);
    expect(el.props.tab).toBe("tumu");
    expect(el.props.outletId).toBe("out1");
  });

  it("the retired ?sekme=teyit falls back to the full board (RO-TAL gate)", async () => {
    ctxOf({ "RO-TAL:V": true });
    const el = (await renderOdaServisi(Promise.resolve({ sekme: "teyit" }))) as { props: { tab: string } };
    expect(el.props.tab).toBe("tumu");
    ctxOf({ "RO-TES:V": true });
    await expect(renderOdaServisi(Promise.resolve({ sekme: "teyit" }))).rejects.toThrow("NEXT_REDIRECT:/yetkisiz?ekran=RO-TAL");
  });

  it("blocks ?sekme=teslim without RO-TES V and the default tab without RO-TAL V", async () => {
    ctxOf({ "RO-TAL:V": true });
    await expect(renderOdaServisi(Promise.resolve({ sekme: "teslim" }))).rejects.toThrow("RO-TES");
    ctxOf({ "RO-TES:V": true });
    await expect(renderOdaServisi(Promise.resolve({}))).rejects.toThrow("NEXT_REDIRECT:/yetkisiz?ekran=RO-TAL");
  });

  it("the MyBar panel follows MB-PERS V", async () => {
    ctxOf({ "RO-TAL:V": true, "MB-PERS:V": true });
    const el = (await renderOdaServisi(Promise.resolve({}))) as { props: { showMybar: boolean } };
    expect(el.props.showMybar).toBe(true);
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
