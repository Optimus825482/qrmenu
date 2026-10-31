import "dotenv/config";
import net from "node:net";
import {
  fetchJobs,
  heartbeat,
  reportJob,
  type ClaimedJob,
  type ClaimedPrinter,
  type PrinterHeartbeatStatus,
} from "./client.js";
import { encodeReceipt } from "./escpos.js";
import { tcpPing } from "./ping.js";
import { renderReceipt, type ReceiptPayload } from "./render.js";

const POLL_MS = parsePositiveInt(process.env.POLL_MS, 2000);
const HEARTBEAT_MS = 30_000;
const PRINTER_TIMEOUT_MS = 3000;

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === "") return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function log(message: string): void {
  console.log(`${new Date().toISOString()} ${message}`);
}

/** Veriyi yazıcıya TCP (genelde 9100) üzerinden yazar; bitince bağlantıyı kapatır. */
function sendToPrinter(ip: string, port: number, data: Buffer, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    let settled = false;

    const finish = (err?: Error) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      if (err) reject(err);
      else resolve();
    };

    socket.setTimeout(timeoutMs);
    socket.once("connect", () => {
      log(`Yazıcı bağlantısı kuruldu: ${ip}:${port} (${data.length} bayt)`);
      socket.end(data); // veriyi yaz ve FIN gönder
    });
    socket.once("timeout", () => finish(new Error(`Zaman aşımı: ${ip}:${port} (${timeoutMs} ms)`)));
    socket.once("error", (err) => finish(err));
    // end(data) başarılıysa temiz kapanış → başarı; hata sonrası close sessizce yutulur.
    socket.once("close", (hadError) => {
      if (!hadError && !settled) finish();
    });

    socket.connect(port, ip);
  });
}

/** Tek işi basar: render → encode → TCP yazma. */
async function printJob(job: ClaimedJob): Promise<void> {
  const { printer } = job;
  const payload = job.payload as ReceiptPayload;
  const width = printer.paperWidth === 58 ? 32 : 48; // 58 mm → 32 sütun, 80 mm → 48 sütun
  const lines = renderReceipt(payload, width);
  // Başlık satırı encodeReceipt içinde çift boy/ortalı blok olarak basılır;
  // gövde satırlarını başlıksız geçiyoruz (çift basım olmasın).
  const title = lines[0]?.trim() ?? "MERIT OS";
  const buffer = encodeReceipt(lines.slice(1), { codepage: "cp857", title });
  await sendToPrinter(printer.ip, printer.port, buffer, PRINTER_TIMEOUT_MS);
}

/** Kuyruğu yoklar; her işi basar, sonucu bildirir. Hata tek işi durdurmaz. */
async function pollOnce(): Promise<void> {
  const jobs = await fetchJobs();
  if (jobs.length > 0) {
    log(`${jobs.length} iş çekildi`);
  }
  for (const job of jobs) {
    try {
      await printJob(job);
      await reportJob(job.id, { ok: true });
      log(`BASILDI: ${job.id} → ${job.printer.ip}:${job.printer.port}`);
    } catch (err) {
      const message = errorMessage(err);
      log(`HATA: ${job.id}: ${message}`);
      try {
        await reportJob(job.id, { ok: false, error: message });
      } catch (reportErr) {
        log(`Sonuc bildirilemedi: ${job.id}: ${errorMessage(reportErr)}`);
      }
    }
  }
}

/** Güncel yazıcı listesini paralel pingle, sonuçları heartbeat ile bildir; yeni listeyi al. */
async function heartbeatOnce(printerList: ClaimedPrinter[]): Promise<ClaimedPrinter[]> {
  const statuses: PrinterHeartbeatStatus[] = await Promise.all(
    printerList.map(async (printer) => {
      const ok = await tcpPing(printer.ip, printer.port, PRINTER_TIMEOUT_MS);
      return ok
        ? { id: printer.id, ok: true }
        : { id: printer.id, ok: false, message: `Ping başarısız (${printer.ip}:${printer.port})` };
    }),
  );
  return heartbeat(statuses);
}

function main(): void {
  const hotel = process.env.HOTEL_CODE;
  const missing = ["API_URL", "GATEWAY_KEY", "HOTEL_CODE"].filter((name) => !process.env[name]);
  if (missing.length > 0) {
    log(`Ölümcül: eksik ortam değişkenleri: ${missing.join(", ")} (.env dosyasını oluşturun)`);
    process.exit(1);
  }

  log(`Print gateway başlıyor: otel=${hotel}, poll=${POLL_MS} ms, heartbeat=${HEARTBEAT_MS} ms`);

  const timers: NodeJS.Timeout[] = [];

  const pollTimer = setInterval(() => {
    pollOnce().catch((err) => log(`Kuyruk yoklama hatası: ${errorMessage(err)}`));
  }, POLL_MS);
  timers.push(pollTimer);

  let printerList: ClaimedPrinter[] = [];
  const heartbeatTimer = setInterval(() => {
    heartbeatOnce(printerList)
      .then((updated) => {
        printerList = updated;
        log(`Heartbeat tamam: ${updated.length} yazıcı`);
      })
      .catch((err) => log(`Heartbeat hatası: ${errorMessage(err)}`));
  }, HEARTBEAT_MS);
  timers.push(heartbeatTimer);

  // Başlangıçta bir kez hemen çalıştır (listesiz heartbeat sunucudan güncel yazıcı listesini alır).
  pollOnce().catch((err) => log(`Kuyruk yoklama hatası: ${errorMessage(err)}`));
  heartbeatOnce(printerList)
    .then((updated) => {
      printerList = updated;
      log(`Heartbeat tamam: ${updated.length} yazıcı`);
    })
    .catch((err) => log(`Heartbeat hatası: ${errorMessage(err)}`));

  let shuttingDown = false;
  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    log(`${signal} alındı, kapanıyor...`);
    for (const timer of timers) clearInterval(timer);
    process.exit(0);
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

main();
