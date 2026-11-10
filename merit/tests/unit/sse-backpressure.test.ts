import { describe, expect, it, vi } from "vitest";

type Handler = (e: { type: string; hotelId: string; payload?: unknown }) => void;
const hold: { handler?: Handler; unsub: ReturnType<typeof vi.fn> } = { unsub: vi.fn() };

vi.mock("@/lib/realtime", () => ({
  matchesScope: () => true,
  subscribe: (_filter: unknown, h: Handler) => {
    hold.handler = h;
    return hold.unsub;
  },
}));

const { createFilteredSseStream } = await import("@/lib/sse");

describe("SSE yavaş tüketici", () => {
  it("okumayan istemci kuyruğu sınırsız büyütmez: eşik aşılınca abonelik bırakılır", () => {
    const ac = new AbortController();
    createFilteredSseStream(() => true, { signal: ac.signal, pingMs: 3_600_000 });
    // Nobody reads: every frame stays queued.
    for (let i = 0; i < 400; i++) hold.handler!({ type: "order.created", hotelId: "h1" });
    expect(hold.unsub).toHaveBeenCalledTimes(1);
    ac.abort();
  });
});
