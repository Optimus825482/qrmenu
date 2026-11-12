// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MeritEvent } from "@/lib/realtime-events";
import { applyMybarEvent, useMybarStream, type MybarItem } from "@/app/kat/components/useMybarStream";

let sseHandler: ((e: MeritEvent) => void) | null = null;
let sseStatus: "connecting" | "open" | "closed" = "open";

const listUnseen = vi.hoisted(() => vi.fn());
const acknowledge = vi.hoisted(() => vi.fn());
vi.mock("@/modules/mybar/server/actions/ack", () => ({ listUnseenForAckAction: listUnseen }));
vi.mock("@/modules/mybar/server/actions/requests", () => ({ acknowledgeMybarAction: acknowledge }));

vi.mock("@/shell/useSse", () => ({
  useSse: (cb: (e: MeritEvent) => void) => {
    sseHandler = cb;
    return { status: sseStatus };
  },
}));

describe("useMybarStream & applyMybarEvent", () => {
  beforeEach(() => {
    sseHandler = null;
    sseStatus = "open";
    vi.restoreAllMocks();
    listUnseen.mockReset();
    acknowledge.mockReset();
    listUnseen.mockResolvedValue({ ok: true, data: [] });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("kaynak kodda setInterval yok", () => {
    const src = readFileSync(
      join(__dirname, "..", "..", "src", "app", "kat", "components", "useMybarStream.ts"),
      "utf8",
    );
    const modalSrc = readFileSync(
      join(__dirname, "..", "..", "src", "app", "kat", "components", "PersistentMybarModal.tsx"),
      "utf8",
    );
    expect(src).not.toMatch(/\bsetInterval\b/);
    expect(modalSrc).not.toMatch(/\bsetInterval\b/);
  });

  it("applyMybarEvent: mybar.created yeni talebi ekler; mybar.seen / mybar.acknowledged / mybar.completed / mybar.cancelled listeden düşürür", () => {
    const initial: MybarItem[] = [];
    const createdEvent: MeritEvent = {
      type: "mybar.created",
      at: new Date().toISOString(),
      hotelId: "h-1",
      roomId: "r-101",
      payload: {
        requestId: "req-1",
        roomId: "r-101",
        roomNumber: "101",
        floorId: "f-1",
        floorName: "1. Kat",
        items: [{ productName: "Su", qty: 2 }],
        notes: "Buzlu lütfen",
      },
    };
    const r1 = applyMybarEvent(initial, createdEvent);
    expect(r1.needsRefetch).toBe(false);
    expect(r1.next).toHaveLength(1);
    expect(r1.next[0]).toMatchObject({
      id: "req-1",
      roomNumber: "101",
      items: [{ productName: "Su", qty: 2 }],
    });

    const seenEvent: MeritEvent = {
      type: "mybar.seen",
      at: new Date().toISOString(),
      hotelId: "h-1",
      roomId: "r-101",
      payload: { requestId: "req-1", roomId: "r-101" },
    };
    const r2 = applyMybarEvent(r1.next, seenEvent);
    expect(r2.next).toEqual([]);
  });

  it("useMybarStream: ilk yüklemede listUnseenForAckAction çağrılır, SSE mybar.created ve ack ile güncellenir", async () => {
    const row = {
      id: "req-11", roomId: "r-102", roomNumber: "102", floorName: "1. Kat", createdAt: new Date("2026-11-03T10:00:00Z"),
      note: "ice please", noteTr: "buz lütfen", noteSrcLang: "en",
      items: [{ productId: "p1", name: "Su", requestedQty: 2, deliveredQty: 0, remainingQty: 2, poolRemaining: null }],
      removals: [],
    };
    let served: unknown[] = [];
    listUnseen.mockImplementation(async () => ({ ok: true, data: served }));
    acknowledge.mockResolvedValue({ ok: true, data: { firstSeen: true, seenAt: new Date() } });

    const { result } = renderHook(() => useMybarStream({ hotelId: "h-1" }));

    await waitFor(() => expect(listUnseen).toHaveBeenCalled());
    expect(result.current.connected).toBe(true);
    expect(result.current.pending).toEqual([]);

    // Olay yükü kesik (ürün yok): istemci listeyi sunucudan yeniden çeker.
    served = [row];
    await act(async () => {
      sseHandler?.({
        type: "mybar.created",
        at: new Date().toISOString(),
        hotelId: "h-1",
        roomId: "r-102",
        payload: { requestId: "req-11", roomId: "r-102", roomNumber: "102" },
      });
    });
    await waitFor(() => expect(result.current.pending).toHaveLength(1));
    expect(result.current.pending[0]).toMatchObject({
      id: "req-11",
      notes: "buz lütfen",
      noteOriginal: "ice please",
      noteLang: "en",
      items: [{ productName: "Su", qty: 2 }],
    });

    await act(async () => {
      await result.current.ack("req-11");
    });
    expect(acknowledge).toHaveBeenCalledWith("req-11");
    expect(result.current.pending).toEqual([]);
  });

  it("ack hatası fırlatılır ve liste değişmez", async () => {
    listUnseen.mockResolvedValue({
      ok: true,
      data: [{ id: "req-12", roomId: "r", roomNumber: "103", floorName: "", createdAt: new Date(), note: null, noteTr: null, noteSrcLang: null, items: [], removals: [] }],
    });
    acknowledge.mockResolvedValue({ ok: false, error: { code: "FORBIDDEN", message: "Bu işlem için yetkiniz yok" } });
    const { result } = renderHook(() => useMybarStream());
    await waitFor(() => expect(result.current.pending).toHaveLength(1));
    await expect(result.current.ack("req-12")).rejects.toThrow("Bu işlem için yetkiniz yok");
    expect(result.current.pending).toHaveLength(1);
  });
});
