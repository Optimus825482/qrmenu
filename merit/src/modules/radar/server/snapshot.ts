// Server snapshot of one hotel (spec 3.2): the starting point of the browser store. Read-only, scoped by hotel,
// layer-gated, and free of prices, notes, IPs and guest data. Concurrent identical requests share one run.
import type { Ctx } from "@/lib/auth";
import { singleFlight } from "@/lib/singleFlight";
import type { AlertLayers } from "../alerts";
import type { RadarLayer, RadarSnapshot } from "../types";
import { loadEnv } from "./config";
import { minibarLayer } from "./layers/minibar";
import { orderLayer } from "./layers/order";
import { roomServiceLayer } from "./layers/roomService";
import { sparklineLayer } from "./layers/sparkline";
import { staffLayer } from "./layers/staff";
import { systemLayer } from "./layers/system";
import { assertRadarScope } from "./scope";

const FLIGHT_TTL_MS = 2000;

async function build(
  ctx: Ctx,
  hotelId: string,
  now: Date,
  visible: readonly RadarLayer[],
  historical = false,
): Promise<RadarSnapshot> {
  const env = await loadEnv(ctx, hotelId, now, historical);
  const has = (l: RadarLayer) => visible.includes(l);
  const [minibar, order, roomService, staff, sparkline] = await Promise.all([
    has("MINIBAR") ? minibarLayer(env) : undefined,
    has("SIPARIS") ? orderLayer(env) : undefined,
    has("ODA_SERVISI") ? roomServiceLayer(env) : undefined,
    has("PERSONEL") ? staffLayer(env) : undefined,
    sparklineLayer(hotelId, now, visible),
  ]);

  const layers: AlertLayers = {
    ...(minibar ? { minibar: minibar.layer } : {}),
    ...(order ? { order: order.layer } : {}),
    ...(roomService ? { roomService } : {}),
    ...(staff ? { staff: staff.layer } : {}),
  };
  const system = await systemLayer(env, layers);

  const people = env.named ? { ...minibar?.people, ...order?.people, ...staff?.people } : undefined;
  return {
    generatedAt: now.toISOString(),
    hotelId,
    businessDate: env.today,
    layers: { ...layers, system },
    ...(people ? { people } : {}),
    config: env.config,
    sparkline,
  };
}

/**
 * `CR-RAD V` on the hotel, then the layers the caller's screens allow. With `asOf` the layers rebuild the state at that
 * past instant from the event and timestamp columns (day replay). With an injected `now` (tests) the result is computed fresh; live calls share one run per role, hotel and layer set for 2 seconds.
 */
export async function radarSnapshot(
  ctx: Ctx,
  hotelId: string,
  opts: { now?: Date; asOf?: Date; layers?: readonly RadarLayer[] } = {},
): Promise<RadarSnapshot> {
  const allowed = await assertRadarScope(ctx, hotelId, "V");
  // `layers` only narrows (a board that shows one operation asks for that layer alone); it never widens the scope.
  const visible = opts.layers ? allowed.filter((l) => opts.layers!.includes(l)) : allowed;
  // Day replay: the state at a past instant (never shared between callers, never cached).
  if (opts.asOf) return build(ctx, hotelId, opts.asOf, visible, true);
  if (opts.now) return build(ctx, hotelId, opts.now, visible);
  return singleFlight(`${ctx.user.roleId}:${hotelId}:${visible.join()}`, FLIGHT_TTL_MS, () =>
    build(ctx, hotelId, new Date(), visible),
  );
}
