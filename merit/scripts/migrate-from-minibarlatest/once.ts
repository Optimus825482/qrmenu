/**
 * Eski minibar verisinin dağıtım sırasında YALNIZ BİR KEZ aktarılması (docker-entrypoint.sh arka planda çağırır).
 *
 *  - LEGACY_DATABASE_URL tanımlı değilse hiçbir şey yapmaz.
 *  - "Bir kez" güvencesi hedef veritabanındaki işarettir (settings: migration.legacy.completedAt). İşaret yalnız
 *    aktarım temiz bittiğinde (çıkış kodu 0) yazılır; hata olursa yazılmaz ve sonraki açılışta kaldığı yerden
 *    yeniden denenir (legacy_id_map çift kaydı önler).
 *  - Aynı anda açılan iki kap aynı anda başlamasın diye oturum düzeyinde advisory lock tutulur.
 *  - Bayraklar sabittir: yalnız depo sorumluları taşınır, hedefteki güncel katalog korunur.
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Client } from "pg";
import { main as migrate } from "./index";
import { describeError, redact } from "./report";

export const MARKER_KEY = "migration.legacy.completedAt";
export const ONCE_ARGS = ["--user-roles", "depo_sorumlusu", "--frozen-catalog"] as const;
/** pg_advisory_lock anahtarı (sabit, keyfî). */
const LOCK_KEY = 880_611_01;

export interface OnceDb {
  query(sql: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
  end(): Promise<void>;
}

export interface OnceDeps {
  connect: (url: string) => Promise<OnceDb>;
  /** Eski veritabanına bir bağlantı açıp kapatır; ulaşılamıyorsa hata fırlatır. */
  probeLegacy: (url: string) => Promise<void>;
  migrate: (argv: string[], env: Record<string, string | undefined>) => Promise<number>;
  log: (line: string) => void;
  reportPath: string;
}

function legacyHost(url: string): string {
  try {
    return new URL(url).hostname || "?";
  } catch {
    return "? (adres çözümlenemedi)";
  }
}

export type OnceResult = "kapali" | "zaten-yapildi" | "kilitli" | "tamam" | "basarisiz";

export async function runOnce(env: Record<string, string | undefined>, deps: OnceDeps): Promise<OnceResult> {
  const { log } = deps;
  if (!env.LEGACY_DATABASE_URL?.trim()) return "kapali";
  if (!env.DATABASE_URL?.trim()) {
    log("Eski veri aktarımı: DATABASE_URL tanımlı değil, atlandı.");
    return "basarisiz";
  }
  const db = await deps.connect(env.DATABASE_URL);
  try {
    const lock = await db.query("SELECT pg_try_advisory_lock($1) AS ok", [LOCK_KEY]);
    if (lock.rows[0]?.ok !== true) {
      log("Eski veri aktarımı: başka bir kap şu an çalıştırıyor, atlandı.");
      return "kilitli";
    }
    const done = await db.query(`SELECT "value" FROM "settings" WHERE "key" = $1 AND "hotel_id" IS NULL LIMIT 1`, [MARKER_KEY]);
    if (done.rows.length > 0) {
      log(`Eski veri aktarımı daha önce tamamlanmış (${JSON.stringify(done.rows[0].value)}); atlandı. LEGACY_DATABASE_URL kaldırılabilir.`);
      return "zaten-yapildi";
    }

    // Ön denetim: eski veritabanına kabın içinden ulaşılabiliyor mu? (En sık hata: adreste "localhost" — kap kendine bakar.)
    const host = legacyHost(env.LEGACY_DATABASE_URL);
    try {
      await deps.probeLegacy(env.LEGACY_DATABASE_URL);
    } catch (error) {
      log(`UYARI: Eski veritabanına bağlanılamadı (sunucu: ${host}): ${describeError(error)}`);
      if (/^(localhost|127\.0\.0\.1|::1|\[::1\])$/i.test(host)) {
        log(
          'LEGACY_DATABASE_URL adresinde "localhost" var: kabın içinde bu, kabın kendisidir. Eski yedeği bu sunucudaki ' +
            'PostgreSQL\'e ayrı bir veritabanı olarak yükleyip adreste sunucu adını (compose içinde "postgres") kullanın.',
        );
      }
      return "basarisiz";
    }

    log("Eski veri aktarımı başladı (arka planda, yaklaşık 10 dakika; site bu sırada açık).");
    const code = await deps.migrate([...ONCE_ARGS, "--report", deps.reportPath], env);
    const report = await fs.readFile(deps.reportPath, "utf8").catch(() => "");
    // Raporun yalnız özet bölümü günlüğe yazılır (sayılar; kişisel veri içermez).
    const summary = report.split(/\r?\n/).slice(0, 10).join("\n");
    if (summary) log(summary);

    if (code !== 0) {
      log(`UYARI: Eski veri aktarımı tamamlanamadı (çıkış kodu ${code}). İşaret yazılmadı; sonraki açılışta yeniden denenecek. Rapor: ${deps.reportPath}`);
      return "basarisiz";
    }
    await db.query(
      `INSERT INTO "settings" ("id", "hotel_id", "key", "value", "created_at", "updated_at")
       VALUES ('c' || substr(md5('setting:' || $1), 1, 24), NULL, $1, to_jsonb($2::text), now(), now())`,
      [MARKER_KEY, new Date().toISOString()],
    );
    log("Eski veri aktarımı TEMİZ tamamlandı ve bir daha çalışmayacak. LEGACY_DATABASE_URL değişkeni kaldırılabilir.");
    return "tamam";
  } finally {
    // Oturum kapanınca advisory lock kendiliğinden bırakılır.
    await db.end().catch(() => undefined);
  }
}

if (/^once\.[cm]?[jt]s$/.test(path.basename(process.argv[1] ?? ""))) {
  const log = (line: string) => console.log(redact(line));
  runOnce(process.env, {
    connect: async (url) => {
      const client = new Client({ connectionString: url });
      await client.connect();
      return client as unknown as OnceDb;
    },
    probeLegacy: async (url) => {
      const client = new Client({ connectionString: url, connectionTimeoutMillis: 10_000 });
      try {
        await client.connect();
        await client.query("SELECT 1");
      } finally {
        await client.end().catch(() => undefined);
      }
    },
    migrate: (argv, env) => migrate(argv, env, { log }),
    log,
    reportPath: path.join(os.tmpdir(), "eski-veri-aktarim-raporu.md"),
  }).then(
    (result) => process.exit(result === "basarisiz" ? 1 : 0),
    (error) => {
      console.error(redact(`UYARI: Eski veri aktarımı çalıştırılamadı: ${error instanceof Error ? error.message : String(error)}`));
      process.exit(1);
    },
  );
}
