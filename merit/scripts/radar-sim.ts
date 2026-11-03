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
};

function parseArgs(argv: string[]): SimArgs {
  let hotel = "ROYAL";
  let rate = 2;
  let duration = 30;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--hotel" && argv[i + 1]) hotel = argv[++i];
    else if (a === "--rate" && argv[i + 1]) rate = Math.max(0.2, Math.min(20, Number(argv[++i]) || 2));
    else if (a === "--duration" && argv[i + 1]) duration = Math.max(1, Math.min(3600, Number(argv[++i]) || 30));
  }
  return { hotel, rate, duration };
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

  while (Date.now() < stopAt) {
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
