// Authorised KPI API of the Komuta Merkezi chips and the mobile İzleme tab (P7 T10): per-hotel counters plus
// totals, for the whole complex, one hotel or one outlet. A counter appears only where the hotel has the module
// on and the caller may view the metric's screen (`can` folds both in); anything else is omitted, never zeroed.
import { z } from "zod";
import type { Ctx } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { subscribe } from "@/lib/realtime";
import { DomainError } from "@/lib/result";
import { invalidateSingleFlight, singleFlight } from "@/lib/singleFlight";
import { audit } from "@/modules/core/server/audit";
import { affectsKpi } from "@/modules/reporting/radarKpiEvents";
import {
  pct,
  RADAR_METRICS,
  toRadarMetric,
  type RadarMetric,
  type RadarMetricDef,
  type RadarMetricKey,
} from "./metrics";

export type KpiScope = "total" | "hotel" | "outlet";

export const kpiRequestSchema = z.strictObject({
  scope: z.enum(["total", "hotel", "outlet"]),
  hotelId: z.string().min(1).max(64).optional(),
  outletId: z.string().min(1).max(64).optional(),
});
export type KpiRequest = z.infer<typeof kpiRequestSchema>;

export type KpiHotel = { hotelId: string; code: string; name: string; metrics: RadarMetric[] };

export type KpiResponse = {
  generatedAt: string;
  /** The scope actually served (an OUTLET session is always narrowed to `outlet`). */
  scope: KpiScope;
  hotelId?: string;
  outletId?: string;
  hotels: KpiHotel[];
  /** Sum over the hotels that show the metric; `taskCompletionPct` is weighted (done items / all items). */
  totals: Partial<Record<RadarMetricKey, RadarMetric>>;
};

const FLIGHT_TTL_MS = 2000;
const FLIGHT_PREFIX = "kpi:";

/** Drops every cached KPI result (called on the events in `KPI_EVENT_TYPES`). */
export function invalidateKpiCache(): void {
  invalidateSingleFlight(FLIGHT_PREFIX);
}

let hooked = false;
/** Subscribes (once per process) to the realtime channel so a relevant event ends the 2 s cache early. */
export function installKpiInvalidation(): void {
  if (hooked) return;
  hooked = true;
  subscribe((e) => affectsKpi(e.type), invalidateKpiCache);
}

async function deny(ctx: Ctx, req: KpiRequest): Promise<never> {
  try {
    await audit(prisma, {
      userId: ctx.user.id,
      hotelId: ctx.session.hotelId,
      action: "YETKISIZ_DENEME",
      entity: "RadarKpi",
      entityId: req.scope,
      after: { hotelId: req.hotelId, outletId: req.outletId },
    });
  } catch (error) {
    console.error("radar kpi: YETKISIZ_DENEME denetim kaydı yazılamadı", error);
  }
  throw new DomainError("FORBIDDEN", "Bu işlem için yetkiniz yok");
}

type Resolved = { scope: KpiScope; hotelIds: string[]; hotelId?: string; outletId?: string };

async function resolve(ctx: Ctx, req: KpiRequest): Promise<Resolved> {
  const { scope, outletId } = req;
  const sessionOutlet = ctx.session.outletId;
  if (sessionOutlet) {
    // An outlet session only ever sees its own outlet.
    if ((outletId && outletId !== sessionOutlet) || (req.hotelId && req.hotelId !== ctx.session.hotelId)) {
      return deny(ctx, req);
    }
    return { scope: "outlet", hotelIds: [ctx.session.hotelId], hotelId: ctx.session.hotelId, outletId: sessionOutlet };
  }
  if (scope === "total") return { scope, hotelIds: [...ctx.hotelIds] };
  if (scope === "hotel") {
    if (!req.hotelId) throw new DomainError("VALIDATION", "Otel seçimi gerekli");
    if (!ctx.hotelIds.includes(req.hotelId)) return deny(ctx, req);
    return { scope, hotelIds: [req.hotelId], hotelId: req.hotelId };
  }
  if (!outletId) throw new DomainError("VALIDATION", "Outlet seçimi gerekli");
  const outlet = await prisma.outlet.findUnique({ where: { id: outletId }, select: { hotelId: true } });
  // Unknown outlet, foreign hotel and mismatching hotel look the same.
  if (!outlet || !ctx.hotelIds.includes(outlet.hotelId) || (req.hotelId && req.hotelId !== outlet.hotelId)) {
    return deny(ctx, req);
  }
  return { scope, hotelIds: [outlet.hotelId], hotelId: outlet.hotelId, outletId };
}

async function build(ctx: Ctx, r: Resolved, now: Date): Promise<KpiResponse> {
  const hotels = await prisma.hotel.findMany({
    where: { id: { in: r.hotelIds }, isActive: true },
    select: { id: true, code: true, name: true },
    orderBy: [{ code: "asc" }],
  });
  const defsFor = r.scope === "outlet" ? RADAR_METRICS.filter((d) => d.outletScoped) : RADAR_METRICS;
  const visible = await Promise.all(
    hotels.map(async (h) => ({
      hotel: h,
      defs: (await Promise.all(defsFor.map(async (d) => ((await can(ctx, d.screenCode, "V", h.id)) ? d : null)))).filter(
        (d): d is RadarMetricDef => d !== null,
      ),
    })),
  );

  const values = new Map<RadarMetricKey, Map<string, number>>();
  const parts = new Map<RadarMetricKey, Map<string, { num: number; den: number }>>();
  await Promise.all(
    defsFor.map(async (def) => {
      const ids = visible.filter((v) => v.defs.includes(def)).map((v) => v.hotel.id);
      if (ids.length === 0) return;
      if (def.parts) {
        const p = await def.parts(ids, now);
        parts.set(def.key, p);
        values.set(def.key, new Map([...p].map(([id, x]) => [id, pct(x.num, x.den)])));
      } else {
        values.set(def.key, await def.collect(ids, now, r.outletId ? { outletId: r.outletId } : undefined));
      }
    }),
  );

  const rows: KpiHotel[] = visible
    .filter((v) => v.defs.length > 0)
    .map(({ hotel, defs }) => ({
      hotelId: hotel.id,
      code: hotel.code,
      name: hotel.name,
      metrics: defs.map((d) => toRadarMetric(d, values.get(d.key)?.get(hotel.id) ?? 0, now)),
    }));

  const totals: KpiResponse["totals"] = {};
  for (const def of defsFor) {
    const shown = visible.filter((v) => v.defs.includes(def)).map((v) => v.hotel.id);
    if (shown.length === 0) continue;
    const p = parts.get(def.key);
    let value: number;
    if (p) {
      const num = shown.reduce((sum, id) => sum + (p.get(id)?.num ?? 0), 0);
      const den = shown.reduce((sum, id) => sum + (p.get(id)?.den ?? 0), 0);
      value = pct(num, den);
    } else {
      value = shown.reduce((sum, id) => sum + (values.get(def.key)?.get(id) ?? 0), 0);
    }
    totals[def.key] = toRadarMetric(def, value, now);
  }

  return {
    generatedAt: now.toISOString(),
    scope: r.scope,
    ...(r.hotelId ? { hotelId: r.hotelId } : {}),
    ...(r.outletId ? { outletId: r.outletId } : {}),
    hotels: rows,
    totals,
  };
}

/**
 * KPIs of the complex (`total`: every hotel in the caller's scope), one hotel or one outlet. Hotels and
 * outlets outside the caller's scope are FORBIDDEN (audited as YETKISIZ_DENEME); a caller who may view none
 * of the metrics anywhere in the requested scope is FORBIDDEN as well. Concurrent calls share one query
 * (2 s single flight, ended early by `KPI_EVENT_TYPES` events).
 */
export async function kpis(ctx: Ctx, request: KpiRequest): Promise<KpiResponse> {
  const req = kpiRequestSchema.parse(request);
  installKpiInvalidation();
  const r = await resolve(ctx, req);
  const key = `${FLIGHT_PREFIX}${r.scope}:${r.hotelId ?? "*"}:${r.outletId ?? "*"}:${ctx.user.roleId}:${[...r.hotelIds].sort().join(",")}`;
  const result = await singleFlight(key, FLIGHT_TTL_MS, () => build(ctx, r, new Date()));
  if (result.hotels.length === 0) return deny(ctx, req);
  return result;
}
