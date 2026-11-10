#!/usr/bin/env node
/**
 * Misafir QR yolu için kademeli yük testi. Bağımlılığı yoktur (Node 18+).
 *
 * Her sanal misafir gerçek bir misafir gibi davranır: basılı bir oda kodunu açar (/q/KOD), birkaç saniye
 * bekler, oda servisi menüsünü açar (/q/KOD/oda-servisi), yine bekler ve başka bir odayla devam eder.
 *
 * Güvenlik:
 * - Yalnız sayfa AÇAR (GET). Sipariş, MyBar talebi ya da garson çağrısı GÖNDERMEZ.
 * - Yalnız basılı, geçerli kodları kullanır; bilinmeyen kod denemediği için kaba kuvvet sınırına takılmaz.
 * - Veritabanına kayıt düşmez: uygulama okutma kaydını (qr_scan_logs) yalnız gerçek tarayıcı gezinmesinde
 *   yazar; bu betiğin istekleri öyle sayılmaz. İstekler "merit-yuk-testi" tarayıcı adıyla gider.
 * - Yanıt süresi ya da hata oranı eşiği aşarsa test kendiliğinden durur.
 * - localhost dışındaki bir adres için --canli bayrağı zorunludur.
 *
 * Kullanım (merit klasöründe):
 *   node scripts/yuk-testi.mjs --adres http://localhost:3001 --kademeler 5,10 --sure 20
 *   node scripts/yuk-testi.mjs --adres https://qrmenu.merithotels.com --canli
 *
 * Seçenekler:
 *   --adres <url>        Hedef (varsayılan: http://localhost:3001)
 *   --kademeler <liste>  Eşzamanlı misafir sayıları (varsayılan: 10,30,60)
 *   --sure <sn>          Her kademenin süresi (varsayılan: 60)
 *   --bekleme <a-b>      Sayfalar arası düşünme süresi, saniye (varsayılan: 1-3)
 *   --p95 <ms>           Durdurma eşiği: son 10 saniyenin %95 yanıt süresi (varsayılan: 2000)
 *   --hata <yuzde>       Durdurma eşiği: son 10 saniyenin hata oranı (varsayılan: 1)
 *   --kodlar <dosya>     Basılı kod listesi (varsayılan: assets/qr-templates/basili-oda-kodlari.json)
 *   --otel <KOD>         Yalnız bu otelin odaları (ör. DIAMOND)
 *   --canli              localhost dışındaki adrese izin verir
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const USER_AGENT = "merit-yuk-testi/1.0";
const REQUEST_TIMEOUT_MS = 15_000;
const WINDOW_MS = 10_000;
const MIN_WINDOW_SAMPLES = 20;

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) out[key] = true;
    else {
      out[key] = next;
      i += 1;
    }
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
if (args.yardim || args.help) {
  console.log(readFileSync(fileURLToPath(import.meta.url), "utf8").split("*/")[0]);
  process.exit(0);
}

const here = dirname(fileURLToPath(import.meta.url));
const base = String(args.adres ?? "http://localhost:3001").replace(/\/+$/, "");
const stages = String(args.kademeler ?? "10,30,60").split(",").map(Number).filter((n) => Number.isInteger(n) && n > 0);
const stageSeconds = Number(args.sure ?? 60);
const [thinkMin, thinkMax] = String(args.bekleme ?? "1-3").split("-").map(Number);
const p95Limit = Number(args.p95 ?? 2000);
const errorLimit = Number(args.hata ?? 1);
const codesPath = resolve(String(args.kodlar ?? resolve(here, "../assets/qr-templates/basili-oda-kodlari.json")));

function fail(message) {
  console.error(`HATA: ${message}`);
  process.exit(2);
}

if (stages.length === 0 || !(stageSeconds > 0) || !(thinkMax >= thinkMin) || !(thinkMin >= 0)) fail("Geçersiz seçenek; --yardim ile bakın.");
if (stages.some((n) => n > 300)) fail("Kademe en fazla 300 olabilir.");

const host = new URL(base).hostname;
const local = host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host.endsWith(".localhost");
if (!local && !args.canli) fail(`${host} yerel bir adres değil. Canlı sunucuyu test etmek için --canli ekleyin.`);

const list = JSON.parse(readFileSync(codesPath, "utf8"));
const codes = Object.entries(list.hotels ?? {})
  .filter(([hotel]) => !args.otel || hotel === String(args.otel).toUpperCase())
  .flatMap(([, rooms]) => Object.values(rooms));
if (codes.length === 0) fail("Kod listesi boş (dosyayı ya da --otel değerini kontrol edin).");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pick = () => codes[Math.floor(Math.random() * codes.length)];
const think = () => sleep((thinkMin + Math.random() * (thinkMax - thinkMin)) * 1000);
const percentile = (sorted, p) => (sorted.length === 0 ? 0 : sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)]);

/** One finished request: { at, ms, ok, label, status }. */
let samples = [];
let stopReason = null;

async function hit(label, path) {
  const started = performance.now();
  let status = "AĞ";
  let ok = false;
  try {
    const res = await fetch(base + path, {
      headers: { "user-agent": USER_AGENT, "accept-language": "tr" },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      redirect: "follow",
    });
    await res.arrayBuffer();
    status = String(res.status);
    ok = res.status >= 200 && res.status < 400;
  } catch (error) {
    status = error?.name === "TimeoutError" ? "ZAMAN AŞIMI" : "AĞ";
  }
  samples.push({ at: Date.now(), ms: performance.now() - started, ok, label, status });
}

async function guest(until) {
  // Spread the arrivals so a stage does not start with one synchronized burst.
  await sleep(Math.random() * 1000 * Math.max(thinkMin, 0.5));
  while (Date.now() < until && !stopReason) {
    const code = pick();
    await hit("oda", `/q/${code}`);
    if (Date.now() >= until || stopReason) break;
    await think();
    await hit("menü", `/q/${code}/oda-servisi`);
    await think();
  }
}

/** Stops the run when the last 10 seconds breach a threshold. */
async function watchdog(until) {
  while (Date.now() < until && !stopReason) {
    await sleep(1000);
    const since = Date.now() - WINDOW_MS;
    const recent = samples.filter((s) => s.at >= since);
    if (recent.length < MIN_WINDOW_SAMPLES) continue;
    const errorRate = (recent.filter((s) => !s.ok).length / recent.length) * 100;
    const p95 = percentile(recent.map((s) => s.ms).sort((a, b) => a - b), 95);
    if (errorRate > errorLimit) stopReason = `son 10 saniyede hata oranı %${errorRate.toFixed(1)} (eşik %${errorLimit})`;
    else if (p95 > p95Limit) stopReason = `son 10 saniyede %95 yanıt süresi ${Math.round(p95)} ms (eşik ${p95Limit} ms)`;
  }
}

async function health() {
  try {
    const res = await fetch(`${base}/api/health`, { headers: { "user-agent": USER_AGENT }, signal: AbortSignal.timeout(5000) });
    return `${res.status} ${(await res.text()).slice(0, 160)}`;
  } catch (error) {
    return `ulaşılamadı (${error?.name ?? "hata"})`;
  }
}

function report(title, rows, seconds) {
  const line = (label, list) => {
    const times = list.map((s) => s.ms).sort((a, b) => a - b);
    const errors = list.filter((s) => !s.ok);
    const avg = times.reduce((a, b) => a + b, 0) / (times.length || 1);
    return [
      label.padEnd(8),
      String(list.length).padStart(7),
      (list.length / seconds).toFixed(1).padStart(8),
      String(Math.round(avg)).padStart(8),
      String(Math.round(percentile(times, 50))).padStart(8),
      String(Math.round(percentile(times, 95))).padStart(8),
      String(Math.round(percentile(times, 99))).padStart(8),
      String(Math.round(times.at(-1) ?? 0)).padStart(8),
      String(errors.length).padStart(6),
    ].join(" ");
  };
  console.log(`\n${title}`);
  console.log(["sayfa".padEnd(8), "istek".padStart(7), "istek/sn".padStart(8), "ort ms".padStart(8), "%50".padStart(8), "%95".padStart(8), "%99".padStart(8), "en uzun".padStart(8), "hata".padStart(6)].join(" "));
  for (const label of ["oda", "menü"]) console.log(line(label, rows.filter((s) => s.label === label)));
  console.log(line("toplam", rows));
  const byStatus = {};
  for (const s of rows.filter((x) => !x.ok)) byStatus[s.status] = (byStatus[s.status] ?? 0) + 1;
  if (Object.keys(byStatus).length > 0) console.log(`  hatalar: ${Object.entries(byStatus).map(([k, v]) => `${k} × ${v}`).join(", ")}`);
}

console.log(`Hedef: ${base}`);
console.log(`Kodlar: ${codes.length} oda${args.otel ? ` (${String(args.otel).toUpperCase()})` : ""}`);
console.log(`Kademeler: ${stages.join(" → ")} misafir, her biri ${stageSeconds} sn; bekleme ${thinkMin}-${thinkMax} sn`);
console.log(`Durdurma eşikleri: %95 > ${p95Limit} ms ya da hata > %${errorLimit} (son 10 sn)`);
console.log(`Sağlık (başlangıç): ${await health()}`);

// One warm-up request: a wrong address or a dead server must not turn into a 60-guest stampede.
await hit("oda", `/q/${pick()}`);
if (!samples[0].ok) fail(`İlk istek başarısız (${samples[0].status}); test başlatılmadı.`);
console.log(`İlk istek: ${Math.round(samples[0].ms)} ms`);

const all = [];
process.on("SIGINT", () => {
  stopReason = stopReason ?? "kullanıcı durdurdu (Ctrl+C)";
});

for (const users of stages) {
  if (stopReason) break;
  samples = [];
  const started = Date.now();
  const until = started + stageSeconds * 1000;
  console.log(`\n▶ ${users} misafir başlıyor…`);
  await Promise.all([watchdog(until), ...Array.from({ length: users }, () => guest(until))]);
  const seconds = Math.max(1, (Date.now() - started) / 1000);
  report(`■ ${users} misafir, ${Math.round(seconds)} sn`, samples, seconds);
  all.push(...samples);
  console.log(`  sağlık: ${await health()}`);
  if (!stopReason) await sleep(3000);
}

if (stopReason) console.log(`\n⛔ TEST DURDURULDU: ${stopReason}`);
else console.log("\n✔ Bütün kademeler eşiklerin altında tamamlandı.");
console.log(`Toplam istek: ${all.length}, hata: ${all.filter((s) => !s.ok).length}`);
process.exit(stopReason ? 1 : 0);
