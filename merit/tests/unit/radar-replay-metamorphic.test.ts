import { describe, expect, it } from "vitest";
import { compareRadarEvents } from "@/modules/radar/events";
import { comparableState, initialState, toSnapshot } from "@/modules/radar/state";
import type { RadarEvent } from "@/modules/radar/types";
import { applyEvents } from "@/modules/radar/ui/reducers";
import { T0, ev, makeSnapshot, orderStatus } from "../helpers/radarStateFixtures";

/**
 * Metamorphic relation of the replay design: a snapshot taken at `asOf` plus the events after it
 * equals the live state that folded every event from the start. (The DB-backed variant that feeds
 * T6's NDJSON `replayLines` joins this file when that stream lands.)
 */
function chain(): RadarEvent[] {
  const e: RadarEvent[] = [];
  let t = T0 + 1000;
  const step = () => (t += 700);
  e.push(orderStatus(step(), "a", "t1", "GONDERILDI"));
  e.push(orderStatus(step(), "a", "t1", "ONAYLANDI"));
  e.push(orderStatus(step(), "a", "t1", "ONAYLANDI", { prep: true }));
  e.push(orderStatus(step(), "a", "t1", "HAZIR"));
  e.push(orderStatus(step(), "w", "t2", "ONAYLANDI"));
  e.push(orderStatus(step(), "a", "t1", "SERVIS_EDILDI"));
  e.push(ev("call.opened", step(), { callId: "c1", tableId: "t3", callType: "GARSON" }));
  e.push(ev("call.closed", step(), { callId: "c1", tableId: "t3" }));
  e.push(ev("room.checked", step(), { roomId: "r1", checkType: "URUN_EKLENDI", taskStatus: "TAMAMLANDI", byUserId: "u1" }));
  e.push(ev("dnd.marked", step(), { roomId: "r2", count: 1, minChecks: 2, status: "AKTIF" }));
  e.push(ev("dnd.marked", step(), { roomId: "r2", count: 2, minChecks: 2, status: "TAMAMLANDI" }));
  e.push(ev("mybar.opened", step(), { requestId: "m1", roomId: "r3" }));
  e.push(ev("mybar.seen", step(), { requestId: "m1", roomId: "r3" }));
  e.push(ev("mybar.closed", step(), { requestId: "m1", roomId: "r3", outcome: "TAMAM" }));
  e.push(ev("stock.level", step(), { productId: "p1", remaining: 9, critical: 5 }));
  e.push(ev("stock.level", step(), { productId: "p1", remaining: 4, critical: 5 }));
  e.push(ev("printer.health", step(), { printerId: "pr1", state: "SESSIZ" }));
  e.push(ev("printer.health", step(), { printerId: "pr1", state: "HAZIR" }));
  e.push(ev("print.job", step(), { jobId: "j1", printerId: "pr1", status: "KUYRUKTA" }));
  return e;
}

describe("radar replay metamorphic", () => {
  const events = chain();
  const full = initialState(makeSnapshot());
  const liveState = applyEvents(full, events);

  it("asOf anlik goruntusu + sonraki olaylar = canli", () => {
    for (let k = 0; k <= events.length; k++) {
      const asOf = toSnapshot(applyEvents(initialState(makeSnapshot()), events.slice(0, k)));
      const replayed = applyEvents(initialState(asOf), events.slice(k));
      expect(comparableState(replayed)).toEqual(comparableState(liveState));
    }
  });

  it("karisik gelen olaylar compareRadarEvents siralamasiyla ayni sonucu verir", () => {
    const shuffled = [...events].reverse().sort(() => 0).sort(compareRadarEvents);
    expect(comparableState(applyEvents(initialState(makeSnapshot()), shuffled))).toEqual(comparableState(liveState));
    // same-millisecond create + approve, arriving approved-first
    const same = [orderStatus(T0 + 9, "z", "t1", "ONAYLANDI", { id: "b" }), orderStatus(T0 + 9, "z", "t1", "GONDERILDI", { id: "a" })];
    const out = applyEvents(initialState(makeSnapshot()), [...same].sort(compareRadarEvents));
    expect(out.layers.order!.outlets[0].areas[0].tables[0].orders.map((o) => o.status)).toEqual(["ONAYLANDI"]);
  });
});
