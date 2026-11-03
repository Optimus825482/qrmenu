import { describe, expect, it, vi } from "vitest";
import type { RoleKind } from "@/generated/prisma/client";
import type { MeritEvent } from "@/lib/realtime-events";
import { RADAR_EVENT_TYPES } from "@/modules/radar/events";
import { WIRE_ROLE_KINDS } from "@/modules/radar/constants";

vi.mock("@/lib/prisma", async () => ({ prisma: (await import("../helpers/db")).testDb }));
const { matchesScope } = await import("@/lib/realtime");

const ROYAL = "hotel-royal";
const PREMIUM = "hotel-premium";

function envelope(type: string, hotelId: string, extra: Partial<MeritEvent> = {}): MeritEvent {
  const roleKinds = WIRE_ROLE_KINDS[type] ?? undefined;
  return { type, hotelId, ...(roleKinds ? { roleKinds } : {}), at: "2026-11-03T12:00:00.000Z", payload: {}, ...extra } as MeritEvent;
}

const scope = (roleKind: RoleKind, over: Record<string, unknown> = {}) => ({
  userId: "u1",
  sessionId: "s1",
  hotelIds: [ROYAL],
  roleKind,
  ...over,
});

const received = (roleKind: RoleKind, over: Record<string, unknown> = {}) =>
  RADAR_EVENT_TYPES.filter((t) => matchesScope(envelope(t, ROYAL), scope(roleKind, over) as never));

describe("radar olaylarının SSE kapsamı (WIRE_ROLE_KINDS)", () => {
  it("ROYAL kapsamlı YONETIM oturumu PREMIUM zarfını hiçbir radar olayında almaz", () => {
    for (const type of RADAR_EVENT_TYPES) {
      expect(matchesScope(envelope(type, PREMIUM), scope("YONETIM") as never), type).toBe(false);
    }
  });

  it("OUTLET oturumu presence.tick, stock.changed, roomcheck.done, mail.failed almaz", () => {
    const got = received("OUTLET", { outletId: "o1" });
    for (const t of ["presence.tick", "stock.changed", "roomcheck.done", "mail.failed"]) expect(got).not.toContain(t);
    expect(got).toContain("order.created");
  });

  it("MINIBAR oturumu stock.critical ve roomcheck.done alır, presence.tick almaz", () => {
    const got = received("MINIBAR");
    expect(got).toContain("stock.critical");
    expect(got).toContain("roomcheck.done");
    expect(got).not.toContain("presence.tick");
    expect(got).not.toContain("mail.failed");
  });

  it("mail.failed yalnız SISTEM; presence.tick SISTEM ve YONETIM", () => {
    for (const kind of ["YONETIM", "MINIBAR", "OUTLET", "MUTFAK"] as RoleKind[]) {
      expect(received(kind, { outletId: "o1" })).not.toContain("mail.failed");
    }
    expect(received("SISTEM")).toContain("mail.failed");
    expect(received("YONETIM")).toContain("presence.tick");
    expect(received("SISTEM")).toContain("presence.tick");
  });

  it("session.changed: SISTEM oturumu yalnız SISTEM izleyicilerine gider", () => {
    const e = envelope("session.changed", ROYAL, { roleKinds: ["SISTEM"] });
    expect(matchesScope(e, scope("SISTEM") as never)).toBe(true);
    expect(matchesScope(e, scope("YONETIM") as never)).toBe(false);
  });

  it("outletli sipariş ve SLA olayını SISTEM/YONETIM alır, başka outletin personeli almaz", () => {
    for (const type of ["order.created", "order.sla", "printer.status"]) {
      const e = envelope(type, ROYAL, { outletId: "o1" });
      expect(matchesScope(e, scope("SISTEM") as never), type).toBe(true);
      expect(matchesScope(e, scope("YONETIM") as never), type).toBe(true);
      expect(matchesScope(e, scope("OUTLET", { outletId: "o2" }) as never), type).toBe(false);
      expect(matchesScope(e, scope("OUTLET", { outletId: "o1" }) as never), type).toBe(true);
    }
  });

  it("roleKinds tablosu yalnız bilinen radar tel adlarını içerir", () => {
    const known = new Set(RADAR_EVENT_TYPES);
    for (const key of Object.keys(WIRE_ROLE_KINDS)) expect(known.has(key), key).toBe(true);
  });
});
