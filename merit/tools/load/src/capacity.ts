import autocannon from "autocannon";
import { randomUUID } from "node:crypto";
import type { Targets } from "./targets";
/** Optional read-only saturation probe. Run separately from the scenario for interpretable numbers. */
export async function capacity(baseUrl: string, tables: Targets["tables"]) {
  const results = [];
  for (const path of ["/api/health", `/q/${tables[0].token}`]) {
    const result = await autocannon({ url: `${baseUrl}${path}`, connections: 200, duration: 30, pipelining: 1 });
    results.push({ route: path.startsWith("/q/") ? "page" : "health", requests: result.requests.total, errors: result.errors, timeouts: result.timeouts, non2xx: result.non2xx, latency: { p50: result.latency.p50, p95: result.latency.p97_5, p99: result.latency.p99 }, note: "autocannon provides p97.5 (conservative p95 bound)" });
  }
  let n = 0;
  const post = await autocannon({ url: baseUrl, connections: 50, duration: 20, pipelining: 1, requests: [{ method: "POST", path: `/api/q/${tables[0].token}/order`, setupRequest(request) {
    const index = n++, table = tables[index % tables.length];
    request.path = `/api/q/${table.token}/order`;
    request.headers = { "content-type": "application/json", "x-forwarded-for": `10.${Math.floor(index / 60_000) % 250 + 1}.${Math.floor(index / 250) % 250 + 1}.${index % 250 + 1}` };
    request.body = JSON.stringify({ idempotencyKey: randomUUID(), locale: "tr", items: [{ menuNodeId: table.menuNodeId, qty: 1 }] });
    return request;
  } }] });
  results.push({ route: "order", requests: post.requests.total, errors: post.errors, timeouts: post.timeouts, non2xx: post.non2xx, latency: { p50: post.latency.p50, p95: post.latency.p97_5, p99: post.latency.p99 }, note: `HTTP status counts: ${JSON.stringify(post.statusCodeStats)}. 409 is an application open-order limit, not a server capacity failure; rerun with a freshly seeded dedicated DB.` });
  return results;
}
