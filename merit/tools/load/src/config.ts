import { parseArgs } from "node:util";
import { z } from "zod";
export function readConfig() {
  const { values } = parseArgs({ options: { smoke: { type: "boolean" }, guests: { type: "string" }, staff: { type: "string" }, radar: { type: "string" }, minutes: { type: "string" }, ramp: { type: "string" }, target: { type: "string" }, nat: { type: "boolean" }, capacity: { type: "boolean" }, "expect-429": { type: "boolean" }, "managed-server": { type: "boolean" }, targets: { type: "string" } } });
  const n = (v: string | undefined, fallback: number, min: number, max: number) => z.coerce.number().min(min).max(max).parse(v ?? fallback);
  return { smoke: !!values.smoke, guests: Math.floor(n(values.guests, values.smoke ? 30 : 300, 1, 1000)), staff: Math.floor(n(values.staff, values.smoke ? 5 : 40, 0, 40)), radar: Math.floor(n(values.radar, values.smoke ? 0 : 5, 0, 5)), durationMs: n(values.minutes, values.smoke ? 1 : 10, 0.1, 60) * 60_000, rampMs: n(values.ramp, values.smoke ? 5 : 60, 0, 120) * 1000, target: values.target ?? process.env.LOAD_BASE_URL, nat: !!values.nat, capacity: !!values.capacity, managedServer: !!values["managed-server"], expect429: !!values["expect-429"], targetsFile: values.targets ?? "tools/load/.tmp/targets.json" };
}
export type Config = ReturnType<typeof readConfig>;
