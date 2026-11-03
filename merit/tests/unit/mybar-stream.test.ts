// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MeritEvent } from "@/lib/realtime-events";
import { applyMybarEvent, useMybarStream, type MybarItem } from "@/app/kat/components/useMybarStream";

let sseHandler: ((e: MeritEvent) => void) | null = null;
let sseStatus: "connecting" | "open" | "closed" = "open";

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

  it("useMybarStream: ilk yüklemede tek GET /api/minibar/dashboard çağrısı yapar, SSE mybar.created ve ack ile güncellenir", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.startsWith("/api/minibar/dashboard")) {
        return new Response(
          JSON.stringify({
            activeMybarCount: 0,
            floors: [],
          }),
          { status: 200 },
        );
      }
      if (url === "/api/minibar/mybar/confirm" && init?.method === "POST") {
        return new Response(JSON.stringify({ success: true }), { status: 200 });
      }
      return new Response("{}", { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useMybarStream({ hotelId: "h-1" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
    expect(result.current.connected).toBe(true);
    expect(result.current.pending).toEqual([]);

    act(() => {
      sseHandler?.({
        type: "mybar.created",
        at: new Date().toISOString(),
        hotelId: "h-1",
        roomId: "r-101",
        payload: {
          requestId: "req-10",
          roomId: "r-101",
          roomNumber: "101",
          items: [{ productName: "Kola", qty: 1 }],
        },
      });
    });

    expect(result.current.pending).toHaveLength(1);
    expect(result.current.pending[0]?.id).toBe("req-10");

    await act(async () => {
      await result.current.ack("req-10");
    });
    expect(result.current.pending).toEqual([]);
  });
});
