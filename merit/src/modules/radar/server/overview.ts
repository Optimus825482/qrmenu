// "Tüm kompleks" overview (spec 3.2): one card per hotel the caller may watch, with the permitted counters, a
// sparkline and the two most severe alerts. Hotels outside the caller's scope never appear.
import type { Ctx } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { singleFlight } from "@/lib/singleFlight";
import { RADAR_METRICS, toRadarMetric } from "@/modules/reporting/server/radar/metrics";
import { groupAlerts } from "../alerts";
import type { RadarMetric, RadarOverview } from "../types";
import { assertRadarScope } from "./scope";
import { radarSnapshot } from "./snapshot";

const FLIGHT_TTL_MS = 2000;

async function build(ctx: Ctx, now: Date): Promise<RadarOverview> {
  const hotels = await prisma.hotel.findMany({
    where: { id: { in: ctx.hotelIds }, isActive: true },
    select: { id: true, code: true, name: true },
    orderBy: [{ code: "asc" }],
  });
  const allowed = (
    await Promise.all(hotels.map(async (h) => ((await can(ctx, "CR-RAD", "V", h.id)) ? h : null)))
  ).filter((h): h is (typeof hotels)[number] => h !== null);
  if (allowed.length === 0) return { generatedAt: now.toISOString(), hotels: [] };

  // Which counters each hotel may show: module on (via can) and the screen viewable there.
  const wanted = await Promise.all(
    allowed.map(async (h) => ({
      hotel: h,
      defs: (
        await Promise.all(
          RADAR_METRICS.map(async (def) => ((await can(ctx, def.screenCode, "V", h.id)) ? def : null)),
        )
      ).filter((d): d is (typeof RADAR_METRICS)[number] => d !== null),
    })),
  );

  const collected = await Promise.all(
    RADAR_METRICS.map(async (def) => {
      const ids = wanted.filter((w) => w.defs.includes(def)).map((w) => w.hotel.id);
      return [def.key, ids.length ? await def.collect(ids, now) : new Map<string, number>()] as const;
    }),
  );
  const values = new Map(collected);

  const snapshots = await Promise.all(allowed.map((h) => radarSnapshot(ctx, h.id)));

  return {
    generatedAt: now.toISOString(),
    hotels: wanted.map(({ hotel, defs }, i) => {
      const snap = snapshots[i]!;
      const metrics: RadarMetric[] = defs.map((def) => toRadarMetric(def, values.get(def.key)?.get(hotel.id) ?? 0, now));
      return {
        hotelId: hotel.id,
        code: hotel.code,
        name: hotel.name,
        metrics,
        sparkline: snap.sparkline,
        topAlerts: groupAlerts(snap.layers.system.alerts, 2).shown,
      };
    }),
  };
}

/** Overview of every hotel the caller holds `CR-RAD V` on (never throws for a partial scope). */
export async function radarOverview(ctx: Ctx): Promise<RadarOverview> {
  // Fails fast for a role without the radar anywhere (the session hotel decides the audit row).
  const watchable = await Promise.all(ctx.hotelIds.map((id) => can(ctx, "CR-RAD", "V", id)));
  if (!watchable.some(Boolean)) await assertRadarScope(ctx, ctx.session.hotelId, "V");
  const key = `overview:${ctx.user.roleId}:${[...ctx.hotelIds].sort().join(",")}`;
  return singleFlight(key, FLIGHT_TTL_MS, () => build(ctx, new Date()));
}
