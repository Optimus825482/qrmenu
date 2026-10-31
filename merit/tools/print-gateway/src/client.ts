/**
 * Merit sunucusu istemcisi — print kuyruğu uçları.
 * Ortam değişkenleri: API_URL, GATEWAY_KEY, HOTEL_CODE (dotenv ile .env'den yüklenir).
 *
 * Uçlar:
 *   GET  {API_URL}/api/print-queue?hotel={HOTEL_CODE}&limit={limit} → { jobs: ClaimedJob[] }
 *   POST {API_URL}/api/print-queue/{id}  gövde { ok, error? } → 204
 *   POST {API_URL}/api/print-queue/heartbeat  gövde { hotel, printers } → { printers: [{ id, ip, port }] }
 * Hepsi `Authorization: Bearer GATEWAY_KEY` başlığı taşır.
 */

export type ClaimedPrinter = {
  id: string;
  ip: string;
  port: number;
};

export type ClaimedJob = {
  id: string;
  kind: string;
  /** ReceiptPayload (v:1) — render.ts'deki tip ile aynı şekil. */
  payload: unknown;
  printer: {
    id: string;
    ip: string;
    port: number;
    codepage: string;
    paperWidth: number;
  };
};

export type PrinterHeartbeatStatus = {
  id: string;
  ok: boolean;
  message?: string;
};

export type JobReportResult = { ok: true } | { ok: false; error: string };

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Ortam değişkeni eksik: ${name} (.env dosyasını kontrol edin)`);
  }
  return value;
}

function authHeaders(): Record<string, string> {
  return { Authorization: `Bearer ${requireEnv("GATEWAY_KEY")}` };
}

async function assertOk(res: Response, what: string): Promise<void> {
  if (!res.ok) {
    throw new Error(`${what} başarısız: HTTP ${res.status} ${res.statusText}`);
  }
}

/** Kuyruktan iş çekip talep eder (sunucu tarafında BASILIYOR'a alır). */
export async function fetchJobs(limit = 10): Promise<ClaimedJob[]> {
  const apiUrl = requireEnv("API_URL");
  const hotel = encodeURIComponent(requireEnv("HOTEL_CODE"));
  const res = await fetch(`${apiUrl}/api/print-queue?hotel=${hotel}&limit=${limit}`, {
    headers: authHeaders(),
  });
  await assertOk(res, "fetchJobs");
  const body = (await res.json()) as { jobs?: ClaimedJob[] };
  return body.jobs ?? [];
}

/** İşin sonucunu bildirir: başarılı ({ ok: true }) veya hata mesajıyla. */
export async function reportJob(id: string, result: JobReportResult): Promise<void> {
  const apiUrl = requireEnv("API_URL");
  const res = await fetch(`${apiUrl}/api/print-queue/${encodeURIComponent(id)}`, {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(result),
  });
  await assertOk(res, `reportJob(${id})`);
}

/**
 * Yazıcı durumlarını bildirir; yanıt olarak otelin güncel aktif yazıcı listesini
 * (`{ printers: [{ id, ip, port }] }`) döner — gateway bu listeyi pingleyecek.
 */
export async function heartbeat(printers: PrinterHeartbeatStatus[]): Promise<ClaimedPrinter[]> {
  const apiUrl = requireEnv("API_URL");
  const hotel = requireEnv("HOTEL_CODE");
  const res = await fetch(`${apiUrl}/api/print-queue/heartbeat`, {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ hotel, printers }),
  });
  await assertOk(res, "heartbeat");
  const body = (await res.json()) as { printers?: ClaimedPrinter[] };
  return body.printers ?? [];
}
