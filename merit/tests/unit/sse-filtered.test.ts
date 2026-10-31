import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { dropReferenceData, resetReferenceData } from "../helpers/fixtures";
import { testDb } from "../helpers/db";

vi.mock("@/lib/env", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/env")>();
  return { env: { ...actual.env, DATABASE_URL: process.env.DATABASE_URL_TEST! } };
});
vi.mock("@/lib/prisma", async () => ({ prisma: (await import("../helpers/db")).testDb }));

const { listenerCount, publish, startRealtimeListener, stopRealtimeListener } = await import(
  "@/lib/realtime"
);
const { createFilteredSseStream } = await import("@/lib/sse");
const { GUEST_EVENT_TYPES, SSE_EVENT_TYPES } = await import("@/lib/realtime-events");

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const decoder = new TextDecoder();

async function readUntil(reader: ReadableStreamDefaultReader<Uint8Array>, needle: string, ms = 1500) {
  let text = "";
  const deadline = Date.now() + ms;
  while (!text.includes(needle)) {
    const left = deadline - Date.now();
    if (left <= 0) return text;
    const r = await Promise.race([reader.read(), sleep(left).then(() => "timeout" as const)]);
    if (r === "timeout" || r.done) return text;
    text += decoder.decode(r.value);
  }
  return text;
}

beforeAll(async () => {
  await resetReferenceData();
  await startRealtimeListener();
});
afterAll(async () => {
  await stopRealtimeListener();
  await dropReferenceData();
  await testDb.$disconnect();
});

describe("olay tipleri", () => {
  it("P5 olay tipleri SSE_EVENT_TYPES içinde; misafir listesi onun alt kümesidir", () => {
    for (const t of [
      "menu.availability", "menu.changed", "price.display", "ordering.changed",
      "order.created", "order.approved", "order.rejected", "order.prep", "order.ready",
      "order.served", "order.cancelled", "order.escalated", "call.created", "call.resolved",
      "assignment.changed", "print.queued", "print.printed", "print.failed", "printer.status",
      "scan.table",
    ]) {
      expect(SSE_EVENT_TYPES).toContain(t);
    }
    expect(GUEST_EVENT_TYPES).toEqual([
      "menu.availability", "menu.changed", "price.display", "ordering.changed", "order.approved",
      "order.rejected", "order.prep", "order.ready", "order.served", "order.cancelled",
      "call.resolved",
    ]);
    for (const t of GUEST_EVENT_TYPES) expect(SSE_EVENT_TYPES).toContain(t);
  });
});

describe("createFilteredSseStream", () => {
  it("yalnız süzgecin geçirdiği olayları yazar, userIds alanını siler, iptalde aboneliği bırakır", async () => {
    const base = listenerCount();
    const reader = createFilteredSseStream(
      (e) => (GUEST_EVENT_TYPES as readonly string[]).includes(e.type) && e.outletId === "o-guest",
      { signal: new AbortController().signal },
    ).getReader();
    expect(listenerCount()).toBe(base + 1);
    expect(await readUntil(reader, "event: hello")).toContain("event: hello");

    await publish({ type: "audit.created", outletId: "o-guest" }); // wrong type
    await publish({ type: "menu.changed", outletId: "o-other" }); // wrong outlet
    await publish({ type: "order.ready", outletId: "o-guest", userIds: ["u1"], payload: { n: 1 } });

    const text = await readUntil(reader, "event: order.ready");
    expect(text).toContain("event: order.ready");
    expect(text).not.toContain("audit.created");
    expect(text).not.toContain("menu.changed");
    expect(text).not.toContain("userIds");

    await reader.cancel();
    expect(listenerCount()).toBe(base);
  });
});
