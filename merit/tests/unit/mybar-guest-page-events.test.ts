import { describe, expect, it } from "vitest";
import type { MeritEvent } from "@/lib/realtime-events";
import { guestEventFilter, sanitizeGuestEvent } from "@/modules/menu/guestEventFilter";

const ev = (over: Partial<MeritEvent>): MeritEvent => ({ type: "mybar.seen", hotelId: "h1", roomId: "r1", payload: {}, at: "2026-11-03T00:00:00.000Z", ...over });

describe("misafir olay akışı: MyBar durumu", () => {
  const room = guestEventFilter({ hotelId: "h1", roomId: "r1", orderIds: [] });

  it("yalnız kendi odasının mybar.* olayları geçer", () => {
    for (const type of ["mybar.seen", "mybar.fulfilled", "mybar.completed", "mybar.cancelled"]) {
      expect(room(ev({ type })), type).toBe(true);
    }
    expect(room(ev({ roomId: "r2" }))).toBe(false);
    expect(room(ev({ hotelId: "h2" }))).toBe(false);
    const noRoom = ev({});
    delete noRoom.roomId;
    expect(room(noRoom)).toBe(false);
  });

  it("mybar.created ve scan.room misafire gitmez (personel olayları)", () => {
    expect(room(ev({ type: "mybar.created" }))).toBe(false);
    expect(room(ev({ type: "scan.room" }))).toBe(false);
  });

  it("masa akışı (odasız kapsam) mybar.* olaylarını hiç almaz", () => {
    const table = guestEventFilter({ outletId: "o1", hotelId: "h1", orderIds: [] });
    expect(table(ev({}))).toBe(false);
  });

  it("oda servisi çıkışı olmayan oda akışı outlet olaylarını almaz", () => {
    const mybarOnly = guestEventFilter({ hotelId: "h1", roomId: "r1", orderIds: [] });
    expect(mybarOnly(ev({ type: "menu.availability", outletId: "o1" }))).toBe(false);
  });

  it("yük yalnız requestId'ye indirgenir (personel kimliği, bekleme süresi, kapanış bayrağı sızmaz)", () => {
    const out = sanitizeGuestEvent(
      ev({ type: "mybar.completed", payload: { requestId: "q1", roomId: "r1", byUserId: "u-secret", waitSec: 90, closedWithMissing: true } }),
    );
    expect(out.payload).toEqual({ requestId: "q1" });
    expect(JSON.stringify(out)).not.toContain("u-secret");
    const bare = ev({ type: "mybar.seen" });
    delete bare.payload;
    expect(sanitizeGuestEvent(bare).payload).toEqual({});
  });
});
