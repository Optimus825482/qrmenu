import { config as dotenv } from "dotenv";
import { readFile } from "node:fs/promises";
import { setTimeout as sleep } from "node:timers/promises";
import { readConfig } from "./config";
import { assertSafeTarget } from "./guard";
import { targetSchema } from "./targets";
import { Histogram, HttpMetrics } from "./metrics";
import { guestFlow, httpAgent, measuredRequest, type CreatedMybar, type CreatedOrder } from "./guestFlow";
import { holdSse, sseAgent, sseMetrics } from "./sseHold";
import { watchPool, type PoolMetrics } from "./poolWatch";
import { launchStaffBrowser, loginStaff, operateOrders } from "./staffFlow";
import { saveReport, verdict } from "./report";
import { capacity } from "./capacity";
import { rssMb, startManagedServer } from "./server";

dotenv({ quiet: true });
let phase = "configuration";
let ownedServer: Awaited<ReturnType<typeof startManagedServer>> | undefined;
async function main() {
  const config = readConfig();
  const targets = targetSchema.parse(JSON.parse(await readFile(config.targetsFile, "utf8")));
  targets.baseUrl = config.target ?? targets.baseUrl;
  assertSafeTarget(targets.baseUrl, process.env.DATABASE_URL);
  const password = process.env.LOAD_PASSWORD;
  if (!password || password.length < 10) throw new Error("LOAD_PASSWORD en az 10 karakter olmalı");
  const http = new HttpMetrics(), sse = sseMetrics(), eventLatency = new Histogram();
  const orders: CreatedOrder[] = [], mybars: CreatedMybar[] = [];
  let eventCount = 0;
  const eventIds = new Set<string>();
  const onEvent = (name: string, raw: unknown) => {
    if (name !== "order.approved") return;
    const data = raw as { payload?: { orderId?: string } };
    const order = orders.find((o) => o.id === data.payload?.orderId);
    if (order?.startedAt && !eventIds.has(order.id)) { eventLatency.record(Date.now() - order.startedAt); eventCount++; eventIds.add(order.id); }
  };
  phase = "health";
  if (config.managedServer) ownedServer = await startManagedServer(targets.baseUrl);
  const health = await measuredRequest(`${targets.baseUrl}/api/health`, "health", http, {});
  if (health.status !== 200 || !(health.json as { ok?: boolean } | undefined)?.ok) throw new Error("Hedef sağlıklı değil; jobs/listener açık olmalı");
  if (config.capacity) {
    const result = await capacity(targets.baseUrl, targets.tables);
    console.log(JSON.stringify({ capacity: result })); return;
  }
  phase = "browser";
  const browser = await launchStaffBrowser();
  const stop = new AbortController();
  const abort = () => stop.abort(); process.once("SIGINT", abort); process.once("SIGTERM", abort);
  const db: PoolMetrics = { maxConnections: 0, samplePeak: 0, byApp: {}, samples: 0 };
  const users = [...targets.staff.filter((s) => s.role !== "radar").slice(0, config.staff), ...targets.staff.filter((s) => s.role === "radar").slice(0, config.radar)];
  const pending: Promise<unknown>[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;
  let operations = { approved: 0, served: 0, delivered: 0, mybarClosed: 0 };
  const restart = { ran: false, recovered: false, elapsedMs: 0 };
  const rss: { startMB?: number; endMB?: number; startAfterSec?: number } = {};
  const start = Date.now();
  try {
    phase = "staff-login";
    const sessions = await loginStaff(browser, targets.baseUrl, users, password, http);
    // Steady-state measurement starts after real authenticated sessions have been established.
    phase = "scenario";
    timer = setTimeout(() => stop.abort(), config.durationMs);
    pending.push(watchPool(process.env.DATABASE_URL!, stop.signal, db).catch(() => { stop.abort(); throw new Error("DB ölçümü başarısız"); }));
    for (const session of sessions) pending.push(holdSse(`${targets.baseUrl}/api/sse`, { cookie: session.cookie }, stop.signal, sse));
    const operator = operateOrders(sessions, stop.signal, orders, mybars, http).then((r) => { operations = r; });
    pending.push(operator);
    for (let i = 0; i < config.guests; i++) pending.push(guestFlow(i, config, targets, stop.signal, http, sse, orders, mybars, onEvent));
    const measureStart = Date.now();
    const pid = () => ownedServer?.pid ?? Number(process.env.LOAD_SERVER_PID);
    if (pid()) pending.push((async () => {
      await sleep(180_000, undefined, { signal: stop.signal }).catch(() => {});
      if (!stop.signal.aborted) { rss.startMB = await rssMb(pid()!); rss.startAfterSec = (Date.now() - measureStart) / 1000; }
    })());
    if (ownedServer && !config.smoke && config.durationMs >= 180_000) pending.push((async () => {
      // Reconnect storm before the 3min RSS baseline: both RSS samples belong to the new process.
      await sleep(120_000, undefined, { signal: stop.signal }).catch(() => {});
      if (stop.signal.aborted) return;
      restart.ran = true;
      const before = sse.reconnectOk, at = Date.now(), expected = config.guests + config.staff + config.radar;
      await ownedServer!.restart();
      while (!stop.signal.aborted && Date.now() - at < 60_000 && (sse.active < expected || sse.reconnectOk - before < expected)) await sleep(250);
      restart.elapsedMs = Date.now() - at;
      restart.recovered = sse.active >= expected && sse.reconnectOk - before >= expected && restart.elapsedMs <= 60_000;
    })());
    while (!stop.signal.aborted) {
      await sleep(10_000, undefined, { signal: stop.signal }).catch(() => {});
      if (!stop.signal.aborted) await measuredRequest(`${targets.baseUrl}/api/health`, "health", http, {});
    }
    const settled = await Promise.allSettled(pending);
    if (settled.some((s) => s.status === "rejected")) http.record("health", 0, 0);
    if (pid()) rss.endMB = await rssMb(pid()!);
  } finally {
    clearTimeout(timer); stop.abort(); await Promise.allSettled(pending); await browser.close();
    process.removeListener("SIGINT", abort); process.removeListener("SIGTERM", abort);
  }
  const event = { count: eventCount, p50: eventLatency.percentile(50), p95: eventLatency.percentile(95), p99: eventLatency.percentile(99) };
  const result = { mode: config.smoke ? "smoke" : "full", at: new Date().toISOString(), durationSec: (Date.now() - start) / 1000, guests: config.guests, staff: config.staff, radar: config.radar, nat: config.nat, http: http.result(), status429: http.status429, sse, db, operations, ordersCreated: orders.length, eventLatencyMs: event, restartProbe: restart.ran ? restart : "not_run", rssProbe: rss.startMB ? rss : "not_run" };
  const gate = verdict(result.http, result.status429, sse, db, config.guests + config.staff + config.radar, config.expect429, !config.smoke, event, operations, restart, rss);
  const file = await saveReport({ ...result, ...gate });
  // No tokens, cookie values, URL credentials or staff passwords in output/artifact.
  console.log(JSON.stringify({ ...result, ...gate, artifact: file }, null, 2));
  if (!gate.passed) process.exitCode = 1;
}
void main().catch(() => { console.error(`Yük denemesi durduruldu (${phase}): hedef, ortam, eğitim seed veya personel girişi doğrulanamadı`); process.exitCode = 1; })
  .finally(async () => { await ownedServer?.stop(); await sseAgent.close(); await httpAgent.close(); });
