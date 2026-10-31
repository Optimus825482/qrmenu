import { NextResponse } from "next/server";
import { getBoss, SESSION_SWEEP_QUEUE } from "@/lib/jobs";
import { prisma } from "@/lib/prisma";
import { isListening } from "@/lib/realtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CHECK_TIMEOUT_MS = 3000;

type Status = "ok" | "down";

/** Resolves `true` when `probe` succeeds within the timeout; any error, falsy result or timeout is `false`. */
async function succeeds(probe: () => Promise<unknown>): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<false>((resolve) => {
    timer = setTimeout(() => resolve(false), CHECK_TIMEOUT_MS);
  });
  try {
    return Boolean(await Promise.race([probe().then(() => true), timeout]));
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/** Mirrors src/instrumentation.ts: the switch is honoured outside production only. */
function jobsDisabled(): boolean {
  return process.env.MERIT_DISABLE_JOBS === "1" && process.env.NODE_ENV !== "production";
}

/**
 * Liveness/readiness probe. Unauthenticated on purpose and the body carries only component
 * states and the time, no details or error messages.
 */
export async function GET(): Promise<NextResponse> {
  const disabled = jobsDisabled();

  const db: Status = (await succeeds(() => prisma.$queryRaw`SELECT 1`)) ? "ok" : "down";
  const listener: Status | "disabled" = disabled ? "disabled" : isListening() ? "ok" : "down";
  const boss: Status | "disabled" = disabled
    ? "disabled"
    : (await succeeds(async () => {
          const queue = await (await getBoss()).getQueue(SESSION_SWEEP_QUEUE);
          if (!queue) throw new Error("kuyruk yok");
        }))
      ? "ok"
      : "down";

  const ok = db === "ok" && listener !== "down" && boss !== "down";
  return NextResponse.json(
    { ok, db, listener, boss, time: new Date().toISOString() },
    { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
