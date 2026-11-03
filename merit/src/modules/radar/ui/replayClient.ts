import type { ReplayLine } from "../server/replay/stream";

function parseLine(raw: string): ReplayLine {
  let obj: unknown;
  try {
    obj = JSON.parse(raw);
  } catch {
    throw new Error("Tekrar verisi bozuk");
  }
  if (!obj || typeof obj !== "object" || !("kind" in obj)) {
    throw new Error("Tekrar verisi bozuk");
  }
  const kind = (obj as { kind: unknown }).kind;
  if (kind !== "snapshot" && kind !== "event" && kind !== "more" && kind !== "end") {
    throw new Error("Tekrar verisi bozuk");
  }
  return obj as ReplayLine;
}

/**
 * Reads an `application/x-ndjson` response stream, reassembling lines split across chunk boundaries.
 * Throws `Error("Tekrar verisi bozuk")` if any line is not valid `ReplayLine` JSON.
 */
export async function* readNdjson(res: Response): AsyncGenerator<ReplayLine> {
  if (!res.body) return;
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let carry = "";

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      carry += decoder.decode(value, { stream: true });
      let nl = carry.indexOf("\n");
      while (nl !== -1) {
        const line = carry.slice(0, nl).trim();
        carry = carry.slice(nl + 1);
        if (line.length > 0) yield parseLine(line);
        nl = carry.indexOf("\n");
      }
    }
    carry += decoder.decode();
    const tail = carry.trim();
    if (tail.length > 0) yield parseLine(tail);
  } finally {
    reader.releaseLock();
  }
}

export type LoadReplayParams = {
  hotelId: string;
  day: string;
  from: string;
  to: string;
};

/**
 * Fetches `/api/radar/replay` and follows `more` continuation cursors transparently so the caller sees a single
 * uninterrupted stream of `snapshot`, `event`s, and one final `end` line.
 */
export async function* loadReplay(
  params: LoadReplayParams,
  fetchFn: typeof fetch = fetch,
): AsyncGenerator<ReplayLine> {
  let cursor: string | undefined;
  let totalEvents = 0;

  while (true) {
    const sp = new URLSearchParams({
      hotelId: params.hotelId,
      day: params.day,
      from: params.from,
      to: params.to,
    });
    if (cursor) sp.set("cursor", cursor);

    const res = await fetchFn(`/api/radar/replay?${sp.toString()}`, {
      method: "GET",
      headers: { Accept: "application/x-ndjson" },
    });

    if (!res.ok) {
      let msg = "Tekrar verisi alınamadı";
      try {
        const body = (await res.json()) as { error?: { message?: string }; message?: string };
        if (body?.error?.message) msg = body.error.message;
        else if (body?.message) msg = body.message;
      } catch {
        // fallback message
      }
      throw new Error(msg);
    }

    let nextCursor: string | undefined;
    for await (const line of readNdjson(res)) {
      if (line.kind === "snapshot") {
        if (!cursor) yield line;
      } else if (line.kind === "event") {
        totalEvents++;
        yield line;
      } else if (line.kind === "more") {
        nextCursor = line.cursor;
      } else if (line.kind === "end") {
        // Wait until the final page before emitting `end`.
      }
    }

    if (nextCursor) {
      cursor = nextCursor;
    } else {
      yield { kind: "end", count: totalEvents };
      break;
    }
  }
}
