#!/usr/bin/env tsx
/**
 * Canlı Radar geliştirme / test sahte olay üreticisi (Task 12 / RD-12).
 * Kullanım: tsx scripts/radar-sim.ts --hotel ROYAL --rate 3 --duration 120
 * KURAL: NODE_ENV === "production" ortamında çıkış kodu 1 ile reddedilir.
 */

if (process.env.NODE_ENV === "production") {
  console.error("HATA: radar-sim.ts üretim ortamında (NODE_ENV=production) çalıştırılamaz.");
  process.exit(1);
}

import { prisma } from "../src/lib/prisma";
import { publish } from "../src/lib/realtime";

type SimArgs = {
  hotel: string;
  rate: number;
  duration: number;
  /** Animated scene load: order lifecycles, calls, room checks and MyBar requests (drives the motion layer). */
  scene: boolean;
};

function parseArgs(argv: string[]): SimArgs {
  let hotel = "ROYAL";
  let rate = 2;
  let duration = 30;
  let scene = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--hotel" && argv[i + 1]) hotel = argv[++i];
    else if (a === "--rate" && argv[i + 1]) rate = Math.max(0.2, Math.min(20, Number(argv[++i]) || 2));
    else if (a === "--duration" && argv[i + 1]) duration = Math.max(1, Math.min(3600, Number(argv[++i]) || 30));
    else if (a === "--scene") scene = true;
  }
  return { hotel, rate, duration, scene };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const hotel = await prisma.hotel.findFirst({
    where: { OR: [{ code: args.hotel.toUpperCase() }, { id: args.hotel }] },
    select: { id: true, code: true, name: true },
  });
  if (!hotel) {
    console.error(`Otel bulunamadı: ${args.hotel}`);
    process.exit(1);
  }

  const [tables, rooms, printers] = await Promise.all([
    prisma.outletTable.findMany({
      where: { outlet: { hotelId: hotel.id }, isActive: true },
      select: { id: true, label: true, outletId: true },
      take: 40,
    }),
    prisma.room.findMany({
      where: { hotelId: hotel.id, isActive: true },
      select: { id: true, number: true, floorId: true },
      take: 40,
    }),
    prisma.printer.findMany({
      where: { hotelId: hotel.id, isActive: true },
      select: { id: true, outletId: true },
      take: 10,
    }),
  ]);

  const intervalMs = Math.max(50, Math.round(1000 / args.rate));
  const stopAt = Date.now() + args.duration * 1000;
  let seq = 1;

  console.log(`[radar-sim] ${hotel.name} (${hotel.code}) — ${args.rate} olay/sn, ${args.duration} sn`);

  // Scene mode: every tick advances one table's order through its lifecycle, and now and then opens or closes a
  // call, checks a room or raises a MyBar request. Identifiers only; no free text, as in the real events.
  const LIFECYCLE = [
    ["order.created", "GONDERILDI"],
    ["order.approved", "ONAYLANDI"],
    ["order.prep", "ONAYLANDI"],
    ["order.ready", "HAZIR"],
    ["order.served", "SERVIS_EDILDI"],
  ] as const;
  const orders = new Map<string, { orderId: string; orderNo: number; step: number }>();
  const calls = new Map<string, string>();
  let orderNo = 9000;
  const MINIBAR_ROLES = ["SISTEM", "YONETIM", "MINIBAR"] as const;
  const sceneTick = async (n: number) => {
    const t = tables[n % tables.length];
    if (t) {
      let o = orders.get(t.id);
      if (!o) {
        o = { orderId: `sim-${t.id}-${n}`, orderNo: ++orderNo, step: 0 };
        orders.set(t.id, o);
      }
      const [type, status] = LIFECYCLE[o.step]!;
      await publish({
        type,
        hotelId: hotel.id,
        outletId: t.outletId,
        payload: { orderId: o.orderId, orderNo: o.orderNo, status, tableId: t.id, kind: "MASA" },
      });
      o.step++;
      if (o.step >= LIFECYCLE.length) orders.delete(t.id);
      const open = calls.get(t.id);
      if (open) {
        await publish({
          type: "call.resolved",
          hotelId: hotel.id,
          outletId: t.outletId,
          payload: { callId: open, tableId: t.id },
        });
        calls.delete(t.id);
      } else if (n % 4 === 0) {
        const callId = `sim-call-${t.id}-${n}`;
        calls.set(t.id, callId);
        await publish({
          type: "call.created",
          hotelId: hotel.id,
          outletId: t.outletId,
          payload: { callId, tableId: t.id, type: "GARSON" },
        });
      }
    }
    const r = rooms[n % Math.max(1, rooms.length)];
    if (r && n % 3 === 0) {
      await publish({
        type: "roomcheck.done",
        hotelId: hotel.id,
        roomId: r.id,
        roleKinds: [...MINIBAR_ROLES],
        payload: { roomId: r.id, roomNumber: r.number, floorId: r.floorId, checkType: "SARFIYAT_YOK", addedQty: 0 },
      });
    }
    if (r && n % 9 === 0) {
      await publish({
        type: "mybar.created",
        hotelId: hotel.id,
        roomId: r.id,
        roleKinds: [...MINIBAR_ROLES],
        payload: { requestId: `sim-mybar-${n}`, roomId: r.id, roomNumber: r.number },
      });
    }
  };

  while (Date.now() < stopAt) {
    if (args.scene) {
      await sceneTick(seq);
      seq++;
      await new Promise((r) => setTimeout(r, intervalMs));
      continue;
    }
    const pick = seq % 3;
    if (pick === 0 && tables.length > 0) {
      const t = tables[seq % tables.length]!;
      await publish({
        type: "scan.table",
        hotelId: hotel.id,
        outletId: t.outletId,
        payload: { tableId: t.id },
      });
    } else if (pick === 1 && rooms.length > 0) {
      const r = rooms[seq % rooms.length]!;
      await publish({
        type: "scan.room",
        hotelId: hotel.id,
        roomId: r.id,
        roleKinds: ["SISTEM", "YONETIM", "MINIBAR"],
        payload: { roomId: r.id, roomNumber: r.number, floorId: r.floorId },
      });
    } else if (printers.length > 0) {
      const p = printers[seq % printers.length]!;
      await publish({
        type: "printer.status",
        hotelId: hotel.id,
        ...(p.outletId ? { outletId: p.outletId } : {}),
        payload: { printerId: p.id, ok: true },
      });
    }
    seq++;
    await new Promise((r) => setTimeout(r, intervalMs));
  }

  await prisma.$disconnect();
}

void main();
