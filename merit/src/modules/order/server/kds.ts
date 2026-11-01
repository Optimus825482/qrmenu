import type { Ctx } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertCan } from "@/lib/rbac";
import { DomainError } from "@/lib/result";
import { outletAllowed } from "./approvals";

export type KdsOrder = {
  id: string;
  orderNo: number;
  tableLabel: string;
  createdAt: Date;
  approvedAt: Date;
  prepStartedAt?: Date;
  readyAt?: Date;
  items: { name: string; qty: number; note?: string }[];
  note?: string;
};

export type KdsBoard = { columns: { NEW: KdsOrder[]; PREP: KdsOrder[]; READY: KdsOrder[] } };

/**
 * Kitchen-safe order projection. Deliberately select only production data: price snapshots and
 * totals must never cross this boundary, regardless of the outlet's price-display setting.
 */
async function board(ctx: Ctx, outletId: string): Promise<KdsBoard> {
  const outlet = await prisma.outlet.findUnique({
    where: { id: outletId },
    select: { hotelId: true, kdsEnabled: true },
  });
  if (!outlet || !ctx.hotelIds.includes(outlet.hotelId)) throw new DomainError("NOT_FOUND", "Outlet bulunamadı");
  if (!outletAllowed(ctx, outletId)) throw new DomainError("FORBIDDEN", "Bu outlete erişiminiz yok");
  await assertCan(ctx, "QS-KDS", "V", outlet.hotelId);
  if (!outlet.kdsEnabled) throw new DomainError("CONFLICT", "Bu outlette KDS kapalı");

  const rows = await prisma.order.findMany({
    where: { outletId, OR: [{ status: "ONAYLANDI" }, { status: "HAZIR" }] },
    select: {
      id: true,
      orderNo: true,
      createdAt: true,
      approvedAt: true,
      prepStartedAt: true,
      readyAt: true,
      note: true,
      status: true,
      table: { select: { label: true } },
      items: { orderBy: { createdAt: "asc" }, select: { nameSnapshot: true, qty: true, note: true } },
    },
    orderBy: [{ approvedAt: "asc" }, { id: "asc" }],
  });

  const columns: KdsBoard["columns"] = { NEW: [], PREP: [], READY: [] };
  for (const row of rows) {
    const order: KdsOrder = {
      id: row.id,
      orderNo: row.orderNo,
      tableLabel: row.table?.label ?? "Masa yok",
      createdAt: row.createdAt,
      // A valid READY order necessarily passed through approval. The fallback preserves a stable,
      // safe display if legacy data has an unexpectedly missing timestamp.
      approvedAt: row.approvedAt ?? row.createdAt,
      ...(row.prepStartedAt ? { prepStartedAt: row.prepStartedAt } : {}),
      ...(row.readyAt ? { readyAt: row.readyAt } : {}),
      items: row.items.map((item) => ({ name: item.nameSnapshot, qty: item.qty, ...(item.note ? { note: item.note } : {}) })),
      ...(row.note ? { note: row.note } : {}),
    };
    if (row.status === "HAZIR") columns.READY.push(order);
    else if (row.prepStartedAt) columns.PREP.push(order);
    else columns.NEW.push(order);
  }
  return { columns };
}

export const kds = { board };
