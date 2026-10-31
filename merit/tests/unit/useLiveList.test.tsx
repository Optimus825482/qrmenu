// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MeritEvent } from "@/lib/realtime-events";
import type { ListQuery } from "@/modules/core/server/admin/crud";

let sseHandler: ((e: MeritEvent) => void) | undefined;
let sseTypes: readonly string[] | undefined;
vi.mock("@/shell/useSse", () => ({
  useSse: (cb: (e: MeritEvent) => void, types?: readonly string[]) => {
    sseHandler = cb;
    sseTypes = types;
    return { status: "open" };
  },
}));

const { useLiveList } = await import("@/shell/ui/useLiveList");

const page = (items: string[], total: number, q: ListQuery) => ({
  ok: true as const,
  data: { items: items.map((n) => ({ id: n })), total, page: q.page, pageSize: q.pageSize },
});

const event = (hotelId: string | undefined, entity: string): MeritEvent => ({
  type: "definition.changed",
  hotelId,
  payload: { entity, id: "x", op: "update" },
  at: new Date().toISOString(),
});

beforeEach(() => {
  sseHandler = undefined;
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("useLiveList", () => {
  it("ilk yüklemeyi varsayılan sorguyla yapar ve satırları döndürür", async () => {
    const load = vi.fn(async (q: ListQuery) => page(["a", "b"], 2, q));
    const { result } = renderHook(() => useLiveList(load, { entities: ["Room"] }));
    await waitFor(() => expect(result.current.rows).toHaveLength(2));
    expect(load).toHaveBeenCalledWith({ page: 1, pageSize: 20 });
    expect(result.current.total).toBe(2);
    expect(result.current.loading).toBe(false);
    expect(sseTypes).toEqual(["definition.changed"]);
  });

  it("setQ 300 ms debounce ile yeniden yükler ve sayfayı 1'e alır", async () => {
    const load = vi.fn(async (q: ListQuery) => page(["a"], 1, q));
    const { result } = renderHook(() => useLiveList(load, { entities: ["Room"] }));
    await waitFor(() => expect(load).toHaveBeenCalledTimes(1));
    vi.useFakeTimers();
    act(() => result.current.setQ("20"));
    act(() => result.current.setQ("201"));
    expect(result.current.q).toBe("201");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(299);
    });
    expect(load).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2);
    });
    expect(load).toHaveBeenCalledTimes(2);
    expect(load).toHaveBeenLastCalledWith({ page: 1, pageSize: 20, q: "201" });
  });

  it("setPage ve setSort yeni sorgu ile yükler", async () => {
    const load = vi.fn(async (q: ListQuery) => page(["a"], 100, q));
    const { result } = renderHook(() => useLiveList(load, { entities: ["Room"] }));
    await waitFor(() => expect(load).toHaveBeenCalledTimes(1));
    act(() => result.current.setPage(3));
    await waitFor(() => expect(load).toHaveBeenLastCalledWith({ page: 3, pageSize: 20 }));
    act(() => result.current.setSort({ field: "name", dir: "desc" }));
    await waitFor(() =>
      expect(load).toHaveBeenLastCalledWith({
        page: 1,
        pageSize: 20,
        sort: { field: "name", dir: "desc" },
      }),
    );
  });

  it("definition.changed: entity eşleşirse 500 ms sonra tek yenileme; eşleşmezse yok", async () => {
    const load = vi.fn(async (q: ListQuery) => page(["a"], 1, q));
    renderHook(() => useLiveList(load, { hotelId: "h1", entities: ["Room", "Floor"] }));
    await waitFor(() => expect(load).toHaveBeenCalledTimes(1));
    vi.useFakeTimers();
    act(() => sseHandler?.(event("h1", "Outlet"))); // başka entity
    act(() => sseHandler?.(event("h2", "Room"))); // başka otel
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });
    expect(load).toHaveBeenCalledTimes(1);
    act(() => sseHandler?.(event("h1", "Room")));
    act(() => sseHandler?.(event("h1", "Floor")));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(499);
    });
    expect(load).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2);
    });
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("hotelId verilmediyse her otelin olayı yeniler", async () => {
    const load = vi.fn(async (q: ListQuery) => page(["a"], 1, q));
    renderHook(() => useLiveList(load, { entities: ["Hotel"] }));
    await waitFor(() => expect(load).toHaveBeenCalledTimes(1));
    vi.useFakeTimers();
    act(() => sseHandler?.(event("any", "Hotel")));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(501);
    });
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("hata Result'ı error mesajını verir; eski satırlar korunur", async () => {
    let fail = false;
    const load = vi.fn(async (q: ListQuery) =>
      fail
        ? { ok: false as const, error: { code: "FORBIDDEN" as const, message: "Yetkiniz yok" } }
        : page(["a"], 1, q),
    );
    const { result } = renderHook(() => useLiveList(load, { entities: ["Room"] }));
    await waitFor(() => expect(result.current.rows).toHaveLength(1));
    fail = true;
    act(() => result.current.reload());
    await waitFor(() => expect(result.current.error).toBe("Yetkiniz yok"));
    expect(result.current.rows).toHaveLength(1);
  });
});
