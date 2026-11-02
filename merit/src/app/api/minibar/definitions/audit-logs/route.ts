import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { DomainError } from "@/lib/result";
import { handle, parseQuery } from "@/modules/minibar/server/apiAuthHelper";
import { listSystemAuditLogs } from "@/modules/minibar/server/minibarDefinitionsService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const querySchema = z.object({
  entity: z.string().max(64).optional(),
  action: z.string().max(64).optional(),
  hotelId: z.string().max(64).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});

/** System administrators, or users who hold the audit-log report permission (CR-DEN R) for the hotel. */
export async function GET(req: Request) {
  return handle(async (ctx) => {
    const q = parseQuery(new URL(req.url).searchParams, querySchema);
    const isSystem = ctx.user.roleKind === "SISTEM";

    let hotelIds: string[];
    if (q.hotelId) {
      if (!ctx.hotelIds.includes(q.hotelId) || (!isSystem && !(await can(ctx, "CR-DEN", "R", q.hotelId)))) {
        throw new DomainError("FORBIDDEN", "Bu işlem için yetkiniz yok");
      }
      hotelIds = [q.hotelId];
    } else {
      const allowed = isSystem
        ? ctx.hotelIds
        : (await Promise.all(ctx.hotelIds.map(async (h) => ((await can(ctx, "CR-DEN", "R", h)) ? h : null)))).filter(
            (h): h is string => h !== null,
          );
      if (allowed.length === 0) throw new DomainError("FORBIDDEN", "Bu işlem için yetkiniz yok");
      hotelIds = allowed;
    }
    // Hotel-less system rows are for system administrators only.
    const known = await prisma.hotel.findMany({ where: { id: { in: hotelIds } }, select: { id: true } });
    const logs = await listSystemAuditLogs({
      entity: q.entity,
      action: q.action,
      hotelIds: known.map((h) => h.id),
      includeSystemRows: isSystem && !q.hotelId,
      limit: q.limit,
    });
    return { logs };
  });
}
