import { describe, expect, it } from "vitest";
import type { RadarEvent } from "@/modules/radar/types";
import { describeEvent } from "@/modules/radar/ui/eventSentence";

const BASE = {
  id: "e1",
  at: "2026-11-03T10:00:00.000Z",
  hotelId: "h1",
  outletId: "ol1",
  roomId: "r1",
  byUserId: "u1",
};

const ALL_EVENTS: RadarEvent[] = [
  { ...BASE, layer: "SIPARIS", type: "order.status", orderId: "o1", orderNo: 45, kind: "MASA", to: "ONAYLANDI", tableId: "t1" },
  { ...BASE, layer: "SIPARIS", type: "order.escalated", orderId: "o1", orderNo: 45 },
  { ...BASE, layer: "ODA_SERVISI", type: "order.sla", orderId: "o2", orderNo: 46, level: "BREACH" },
  { ...BASE, layer: "SIPARIS", type: "call.opened", callId: "c1", tableId: "t1", callType: "GARSON" },
  { ...BASE, layer: "SIPARIS", type: "call.closed", callId: "c1", tableId: "t1" },
  { ...BASE, layer: "SIPARIS", type: "table.scanned", tableId: "t1" },
  { ...BASE, layer: "SIPARIS", type: "table.assigned", tableId: "t1", waiterId: "u2" },
  { ...BASE, layer: "SIPARIS", type: "print.job", jobId: "j1", printerId: "p1", orderId: "o1", status: "BASILDI" },
  { ...BASE, layer: "SISTEM", type: "printer.health", printerId: "p1", state: "SESSIZ" },
  { ...BASE, layer: "MINIBAR", type: "room.checked", roomId: "r1", checkType: "URUN_EKLENDI" },
  { ...BASE, layer: "MINIBAR", type: "room.check.changed", roomId: "r1", op: "SIL" },
  { ...BASE, layer: "MINIBAR", type: "room.scanned", roomId: "r1" },
  { ...BASE, layer: "MINIBAR", type: "dnd.marked", roomId: "r1", count: 1, minChecks: 2, status: "AKTIF" },
  { ...BASE, layer: "MINIBAR", type: "dnd.missed", roomIds: ["r1", "r2"] },
  { ...BASE, layer: "MINIBAR", type: "mybar.opened", requestId: "m1", roomId: "r1" },
  { ...BASE, layer: "MINIBAR", type: "mybar.seen", requestId: "m1", roomId: "r1" },
  { ...BASE, layer: "MINIBAR", type: "mybar.closed", requestId: "m1", roomId: "r1", outcome: "TAMAM" },
  { ...BASE, layer: "MINIBAR", type: "task.updated", taskItemId: "ti1", roomId: "r1", to: "TAMAMLANDI" },
  { ...BASE, layer: "MINIBAR", type: "task.generated", date: "2026-11-03", itemCount: 24 },
  { ...BASE, layer: "MINIBAR", type: "stock.level", productId: "pr1", remaining: 3, critical: 5 },
  { ...BASE, layer: "MINIBAR", type: "upload.status", kind: "IN_HOUSE", status: "TAMAMLANDI" },
  { ...BASE, layer: "PERSONEL", type: "presence", sessionId: "s1", userId: "u1", status: "BOSTA" },
  { ...BASE, layer: "SISTEM", type: "mail.failed", kind: "GUNLUK_OZET" },
  { ...BASE, layer: "SIPARIS", type: "outlet.ordering", outletId: "ol1", enabled: false },
];

describe("describeEvent", () => {
  const people = { u1: "Ayşe Kaya", u2: "Mehmet Ali Yılmaz" };
  const ctx = {
    outletName: (id?: string) => (id === "ol1" ? "Havuz Bar" : undefined),
    tableLabel: (id?: string) => (id === "t1" ? "M12" : undefined),
    roomNumber: (id?: string) => (id === "r1" ? "204" : undefined),
    productName: (id?: string) => (id === "pr1" ? "Su 0.5L" : undefined),
    printerName: (id?: string) => (id === "p1" ? "Bar Fiş" : undefined),
  };

  it("produces a non-empty Turkish sentence for every RadarEvent type", () => {
    for (const ev of ALL_EVENTS) {
      const s = describeEvent(ev, people, "full", ctx);
      expect(s.trim().length, `empty for ${ev.type}`).toBeGreaterThan(3);
    }
  });

  it("formats nameStyle 'short' as 'Ayşe K.' and 'full' as 'Ayşe Kaya'", () => {
    const ev = ALL_EVENTS[0]!;
    expect(describeEvent(ev, people, "short", ctx)).toBe("Havuz Bar · M12 · #45 hazırlanıyor · Ayşe K.");
    expect(describeEvent(ev, people, "full", ctx)).toBe("Havuz Bar · M12 · #45 hazırlanıyor · Ayşe Kaya");
  });

  it("falls back to 'Personel' when byUserId is unknown", () => {
    const ev: RadarEvent = { ...ALL_EVENTS[0]!, byUserId: "unknown-user" };
    expect(describeEvent(ev, people, "full", ctx)).toContain("· Personel");
  });

  it("formats call.closed with the resolving waiter name when available", () => {
    const withWaiterId: RadarEvent = {
      ...BASE,
      layer: "SIPARIS",
      type: "call.closed",
      callId: "c1",
      tableId: "t1",
      waiterId: "u2",
    };
    expect(describeEvent(withWaiterId, people, "full", ctx)).toBe("Havuz Bar · M12 · çağrı kapatıldı (Mehmet Ali Yılmaz)");
    expect(describeEvent(withWaiterId, people, "short", ctx)).toBe("Havuz Bar · M12 · çağrı kapatıldı (Mehmet Ali Y.)");

    const withWaiterName: RadarEvent = {
      ...BASE,
      layer: "SIPARIS",
      type: "call.closed",
      callId: "c1",
      tableId: "t1",
      waiterName: "Ahmet Garson",
    };
    expect(describeEvent(withWaiterName, people, "full", ctx)).toBe("Havuz Bar · M12 · çağrı kapatıldı (Ahmet Garson)");

    const withoutWaiter: RadarEvent = {
      ...BASE,
      layer: "SIPARIS",
      type: "call.closed",
      callId: "c1",
      tableId: "t1",
    };
    expect(describeEvent(withoutWaiter, people, "full", ctx)).toBe("Havuz Bar · M12 · çağrı kapatıldı");
  });

  it("never leaks forbidden fields (subtotal, unitPrice, rejectReason, note) from dirty inputs", () => {
    const dirty = {
      ...ALL_EVENTS[0]!,
      to: "REDDEDILDI" as const,
      subtotal: 999.5,
      unitPrice: 120,
      rejectReason: "GIZLI_RED_SEBEBI",
      note: "GIZLI_MISAFIR_NOTU",
    } as unknown as RadarEvent;

    const text = describeEvent(dirty, people, "full", ctx);
    expect(text).not.toMatch(/999|120|GIZLI_RED_SEBEBI|GIZLI_MISAFIR_NOTU|subtotal|unitPrice|rejectReason/i);
  });
});
