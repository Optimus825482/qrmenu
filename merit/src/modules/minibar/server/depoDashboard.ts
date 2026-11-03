import type { Ctx } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { DomainError } from "@/lib/result";
import { businessDate, businessDay } from "@/lib/time";
import { KIND_LABEL_TR, UPLOAD_KINDS } from "../constants";
import { STATUS_RANK, type StockStatus, stockStatus } from "../stockStatus";
import { type CriticalRow } from "./stockViews";
import { type TaskSummary, taskSummary } from "./tasks";

/*
 * Read model of the depot home page ("pano"): today's three occupancy uploads, the open task counts once
 * all three are in, pending requests, the most urgent stock and the last pool movements. Session hotel
 * only, `MB-ZIM V` or `MB-RAP V`, and no price field anywhere.
 */

export type UploadStatusRow = {
  kind: (typeof UPLOAD_KINDS)[number];
  label: string;
  done: boolean;
  fileName?: string;
  /** ISO instant of the upload. */
  at?: string;
};

export type MovementPreview = {
  id: string;
  at: string;
  productName: string;
  type: string;
  qty: number;
  userName: string;
};

export type DepoPano = {
  hotelName: string;
  day: string;
  uploads: UploadStatusRow[];
  /** 0..3 */
  doneCount: number;
  /** Present only when all three files are in. */
  tasks?: TaskSummary;
  /** Stock requests waiting for a decision (BEKLEMEDE). */
  pendingRequests: number;
  /** Correction requests waiting for a decision (BEKLIYOR). */
  pendingCorrections: number;
  /** Products at DIKKAT or worse. */
  criticalCount: number;
  /** At most 5, STOKOUT first, then the biggest shortfall. */
  criticalTop: CriticalRow[];
  /** Today's AKTIF DND rooms. */
  openDnd: number;
  /** The last 10 pool movements. */
  lastMovements: MovementPreview[];
};

export async function depoDashboard(ctx: Ctx, day: string = businessDate(), now: Date = new Date()): Promise<DepoPano> {
  const hotelId = ctx.session.hotelId;
  const allowed = (await can(ctx, "MB-ZIM", "V", hotelId)) || (await can(ctx, "MB-RAP", "V", hotelId));
  if (!allowed) throw new DomainError("FORBIDDEN", "Bu işlem için yetkiniz yok");
  const date = businessDay(day);

  const [hotel, uploadTasks, pendingRequests, pendingCorrections, stocks, openDnd, moves] = await Promise.all([
    prisma.hotel.findUniqueOrThrow({ where: { id: hotelId }, select: { name: true } }),
    prisma.uploadTask.findMany({
      where: { hotelId, date },
      select: { kind: true, status: true, uploadId: true, upload: { select: { fileName: true, createdAt: true } } },
    }),
    prisma.stockRequest.count({ where: { hotelId, status: "BEKLEMEDE" } }),
    prisma.minibarCorrectionRequest.count({ where: { hotelId, status: "BEKLIYOR" } }),
    prisma.hotelStock.findMany({
      where: { hotelId, product: { isActive: true } },
      select: { productId: true, remainingQty: true, criticalLevel: true, product: { select: { name: true } } },
    }),
    prisma.roomDnd.count({ where: { hotelId, date, status: "AKTIF" } }),
    prisma.hotelStockMovement.findMany({
      where: { hotelId, createdAt: { lte: now } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 10,
      select: {
        id: true,
        createdAt: true,
        type: true,
        qty: true,
        product: { select: { name: true } },
        user: { select: { fullName: true } },
      },
    }),
  ]);

  const uploads: UploadStatusRow[] = UPLOAD_KINDS.map((kind) => {
    const t = uploadTasks.find((u) => u.kind === kind);
    const done = !!t && t.status === "TAMAMLANDI" && t.uploadId !== null && t.upload !== null;
    return {
      kind,
      label: KIND_LABEL_TR[kind],
      done,
      ...(done && t.upload ? { fileName: t.upload.fileName, at: t.upload.createdAt.toISOString() } : {}),
    };
  });
  const doneCount = uploads.filter((u) => u.done).length;

  const critical: CriticalRow[] = [];
  for (const s of stocks) {
    const status: StockStatus = stockStatus(s.remainingQty, s.criticalLevel);
    if (status === "NORMAL") continue;
    critical.push({
      productId: s.productId,
      name: s.product.name,
      remaining: s.remainingQty,
      critical: s.criticalLevel,
      missing: Math.max(0, s.criticalLevel - s.remainingQty),
      status,
    });
  }
  critical.sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status] || b.missing - a.missing || a.name.localeCompare(b.name, "tr"));

  return {
    hotelName: hotel.name,
    day,
    uploads,
    doneCount,
    ...(doneCount === UPLOAD_KINDS.length ? { tasks: await taskSummary(prisma, hotelId, day) } : {}),
    pendingRequests,
    pendingCorrections,
    criticalCount: critical.length,
    criticalTop: critical.slice(0, 5),
    openDnd,
    lastMovements: moves.map((m) => ({
      id: m.id,
      at: m.createdAt.toISOString(),
      productName: m.product.name,
      type: m.type,
      qty: m.qty,
      userName: m.user.fullName,
    })),
  };
}
