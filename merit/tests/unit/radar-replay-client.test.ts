import { describe, expect, it } from "vitest";
import type { ReplayLine } from "@/modules/radar/server/replay/stream";
import { loadReplay, readNdjson } from "@/modules/radar/ui/replayClient";
import { H, T0, iso, makeSnapshot } from "../helpers/radarStateFixtures";

function streamResponse(chunks: string[], status = 200): Response {
  const encoder = new TextEncoder();
  let i = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (i < chunks.length) {
        controller.enqueue(encoder.encode(chunks[i++]));
      } else {
        controller.close();
      }
    },
  });
  return new Response(body, {
    status,
    headers: { "Content-Type": status === 200 ? "application/x-ndjson" : "application/json" },
  });
}

describe("replayClient: readNdjson ve loadReplay", () => {
  it("tek satır birden çok parçaya bölünmüş akış doğru çözülür", async () => {
    const line1: ReplayLine = { kind: "snapshot", at: iso(T0), state: makeSnapshot({ generatedAt: iso(T0) }) };
    const line2: ReplayLine = {
      kind: "event",
      e: { id: "e1", at: iso(T0 + 1000), hotelId: H, layer: "SIPARIS", type: "table.scanned", tableId: "t1" },
    };
    const line3: ReplayLine = { kind: "end", count: 1 };
    const full = `${JSON.stringify(line1)}\n${JSON.stringify(line2)}\n${JSON.stringify(line3)}\n`;
    const chunks = [full.slice(0, 25), full.slice(25, 90), full.slice(90, 180), full.slice(180)];
    const res = streamResponse(chunks);
    const out: ReplayLine[] = [];
    for await (const item of readNdjson(res)) out.push(item);
    expect(out).toHaveLength(3);
    expect(out[0].kind).toBe("snapshot");
    expect(out[1]).toEqual(line2);
    expect(out[2]).toEqual(line3);
  });

  it("more satırı sonrası ikinci istek cursor taşır ve olaylar çiftsiz birleşir", async () => {
    const snap: ReplayLine = { kind: "snapshot", at: iso(T0), state: makeSnapshot({ generatedAt: iso(T0) }) };
    const e1: ReplayLine = {
      kind: "event",
      e: { id: "e1", at: iso(T0 + 1000), hotelId: H, layer: "SIPARIS", type: "table.scanned", tableId: "t1" },
    };
    const more: ReplayLine = { kind: "more", nextFrom: iso(T0 + 1000), cursor: `${iso(T0 + 1000)}|e1` };
    const end1: ReplayLine = { kind: "end", count: 1 };
    const e2: ReplayLine = {
      kind: "event",
      e: { id: "e2", at: iso(T0 + 2000), hotelId: H, layer: "SIPARIS", type: "table.scanned", tableId: "t2" },
    };
    const end2: ReplayLine = { kind: "end", count: 1 };

    const urls: string[] = [];
    const fetchFn: typeof fetch = async (input) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      urls.push(url);
      if (urls.length === 1) {
        return streamResponse([`${JSON.stringify(snap)}\n${JSON.stringify(e1)}\n${JSON.stringify(more)}\n${JSON.stringify(end1)}\n`]);
      }
      return streamResponse([`${JSON.stringify(e2)}\n${JSON.stringify(end2)}\n`]);
    };

    const out: ReplayLine[] = [];
    for await (const item of loadReplay({ hotelId: H, day: "2026-11-03", from: "00:00", to: "24:00" }, fetchFn)) {
      out.push(item);
    }
    expect(urls).toHaveLength(2);
    expect(urls[1]).toContain("cursor=");
    const events = out.filter((l): l is Extract<ReplayLine, { kind: "event" }> => l.kind === "event");
    expect(events.map((x) => x.e.id)).toEqual(["e1", "e2"]);
    expect(out[0].kind).toBe("snapshot");
    expect(out[out.length - 1]).toEqual({ kind: "end", count: 2 });
  });

  it("403 gövdesindeki Türkçe ileti fırlar", async () => {
    const fetchFn: typeof fetch = async () =>
      new Response(JSON.stringify({ ok: false, error: { code: "FORBIDDEN", message: "Bu otel için tekrar oynatma yetkiniz yok" } }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    await expect(async () => {
      for await (const line of loadReplay({ hotelId: H, day: "2026-11-03", from: "00:00", to: "24:00" }, fetchFn)) {
        void line;
      }
    }).rejects.toThrow("Bu otel için tekrar oynatma yetkiniz yok");
  });

  it("bozuk satır Error('Tekrar verisi bozuk') fırlatır", async () => {
    const res = streamResponse(["{not-valid-json}\n"]);
    await expect(async () => {
      for await (const line of readNdjson(res)) {
        void line;
      }
    }).rejects.toThrow("Tekrar verisi bozuk");
  });
});
