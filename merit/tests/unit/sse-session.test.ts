import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  dropReferenceData,
  hotelId,
  makeUser,
  resetReferenceData,
  resetTestData,
} from "../helpers/fixtures";
import { testDb } from "../helpers/db";

vi.mock("@/lib/env", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/env")>();
  return { env: { ...actual.env, DATABASE_URL: process.env.DATABASE_URL_TEST! } };
});
vi.mock("@/lib/prisma", async () => ({ prisma: (await import("../helpers/db")).testDb }));

const { listenerCount, startRealtimeListener, stopRealtimeListener } = await import(
  "@/lib/realtime"
);
const { createSseStream } = await import("@/lib/sse");
const { createSession, closeSession } = await import("@/modules/core/server/sessions");

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const decoder = new TextDecoder();

/** Reads chunks until `needle` shows up, the stream ends, or `ms` pass. */
async function readUntil(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  needle: string,
  ms = 1500,
): Promise<{ text: string; done: boolean }> {
  let text = "";
  const deadline = Date.now() + ms;
  while (!text.includes(needle)) {
    const left = deadline - Date.now();
    if (left <= 0) return { text, done: false };
    const r = await Promise.race([reader.read(), sleep(left).then(() => "timeout" as const)]);
    if (r === "timeout") return { text, done: false };
    if (r.done) return { text, done: true };
    text += decoder.decode(r.value);
  }
  return { text, done: false };
}

beforeAll(async () => {
  await resetReferenceData();
  await startRealtimeListener();
});
beforeEach(resetTestData);
afterAll(async () => {
  await stopRealtimeListener();
  await dropReferenceData();
  await testDb.$disconnect();
});

describe("oturum kapanınca SSE akışı", () => {
  async function twoSessions() {
    const user = await makeUser({ username: "sse1", roleCode: "R-GAR", hotelCode: "MR" });
    const hid = await hotelId("MR");
    const mine = await createSession({ userId: user.id, hotelId: hid, roleId: user.roleId });
    const other = await createSession({ userId: user.id, hotelId: hid, roleId: user.roleId });
    // Single-device mode closed `mine` when `other` opened; revive it so both are open at once.
    await testDb.userSession.update({
      where: { id: mine.id },
      data: { status: "ONLINE", logoutReason: null, logoutAt: null },
    });
    const open = (sessionId: string) =>
      createSseStream(
        { userId: user.id, sessionId, hotelIds: [hid], roleKind: "OUTLET" },
        { signal: new AbortController().signal },
      ).getReader();
    return { mine, other, open };
  }

  it("kendi oturumu kapanınca session.closed alır, akış kapanır, abonelik kalkar", async () => {
    const { mine, open } = await twoSessions();
    const base = listenerCount();
    const reader = open(mine.id);
    expect(listenerCount()).toBe(base + 1);

    await closeSession(mine.id, "MANUEL");

    const { text, done } = await readUntil(reader, "event: session.closed");
    expect(text).toContain("event: session.closed");
    expect(text).toContain(`"sessionId":"${mine.id}"`);
    expect(text).not.toContain("userIds");
    if (!done) expect((await reader.read()).done).toBe(true);
    expect(listenerCount()).toBe(base);
  });

  it("aynı kullanıcının başka oturumunun akışı açık kalır", async () => {
    const { mine, other, open } = await twoSessions();
    const base = listenerCount();
    const otherReader = open(other.id);
    expect(listenerCount()).toBe(base + 1);

    await closeSession(mine.id, "MANUEL");
    await sleep(400);

    expect(listenerCount()).toBe(base + 1);
    const result = await readUntil(otherReader, "event: session.closed", 100);
    expect(result.text).not.toContain("session.closed");
    expect(result.done).toBe(false);
    await otherReader.cancel();
    expect(listenerCount()).toBe(base);
  });
});
