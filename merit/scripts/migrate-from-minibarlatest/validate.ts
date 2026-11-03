import fs from "node:fs/promises";
import path from "node:path";
import { Prisma } from "../../src/generated/prisma/client";
import { businessDate } from "../../src/lib/time";
import type { StepName } from "./config";
import { clean, dolumStatusFor, fold } from "./mapping";
import type { Report } from "./report";
import { chunked, idOf, num } from "./steps/shared";
import type { StepContext } from "./types";

export interface ValidationResult {
  code: string;
  level: "PASS" | "WARN" | "FAIL";
  message: string;
  detail?: string[];
}

type Row = Record<string, unknown>;

const SHOWN = 20;
const pass = (code: string, message: string): ValidationResult => ({ code, level: "PASS", message });
const outcome = (code: string, message: string, bad: string[], level: "WARN" | "FAIL"): ValidationResult =>
  bad.length === 0 ? pass(code, message) : { code, level, message: `${message} (${bad.length} sorun)`, detail: bad.slice(0, SHOWN) };

/** Legacy row count of a table (0 when the table does not exist). Independent of the step counters. */
async function legacyCount(ctx: StepContext, table: string): Promise<number> {
  return (await ctx.legacy.tableExists(table)) ? ctx.legacy.count(table) : 0;
}

async function legacyRows(ctx: StepContext, table: string, cols: string[]): Promise<Row[]> {
  if (!(await ctx.legacy.tableExists(table))) return [];
  const have = await ctx.legacy.columns(table);
  const list = cols.map((c) => (have.has(c) ? `"${c}"` : `NULL AS "${c}"`)).join(", ");
  return ctx.legacy.query<Row>(`SELECT ${list} FROM "${ctx.cfg.legacySchema}"."${table}"`);
}

/** Entity -> step that fills it and how many legacy rows it must account for. */
const ENTITY_SOURCES: Record<string, { step: StepName; logs?: boolean; count: (ctx: StepContext) => Promise<number> }> = {
  hotel: { step: "definitions", count: (c) => legacyCount(c, "oteller") },
  floor: { step: "definitions", count: (c) => legacyCount(c, "katlar") },
  room: { step: "definitions", count: (c) => legacyCount(c, "odalar") },
  productGroup: { step: "definitions", count: (c) => legacyCount(c, "urun_gruplari") },
  product: { step: "definitions", count: (c) => legacyCount(c, "urunler") },
  setup: { step: "definitions", count: (c) => legacyCount(c, "setuplar") },
  setupItem: { step: "definitions", count: (c) => legacyCount(c, "setup_icerik") },
  roomTypeSetup: { step: "definitions", count: (c) => legacyCount(c, "oda_tipi_setup") },
  user: { step: "users", count: (c) => legacyCount(c, "kullanicilar") },
  userHotel: { step: "users", count: (c) => legacyCount(c, "kullanici_otel") },
  emailSetting: { step: "users", count: (c) => legacyCount(c, "email_ayarlari") },
  emailLog: { step: "users", count: (c) => legacyCount(c, "email_loglari") },
  stockRequest: { step: "users", count: (c) => legacyCount(c, "kat_sorumlusu_siparis_talepleri") },
  stockRequestItem: { step: "users", count: (c) => legacyCount(c, "kat_sorumlusu_siparis_talep_detaylari") },
  notification: { step: "users", count: (c) => legacyCount(c, "bildirimler") },
  mybarRequest: { step: "history", count: (c) => legacyCount(c, "minibar_dolum_talepleri") },
  mybarRequestItem: { step: "history", count: (c) => legacyCount(c, "minibar_dolum_talebi_detay") },
  minibarTx: { step: "history", count: (c) => legacyCount(c, "minibar_islemleri") },
  minibarTxItem: { step: "history", count: (c) => legacyCount(c, "minibar_islem_detay") },
  roomCheck: { step: "history", count: (c) => legacyCount(c, "oda_kontrol_kayitlari") },
  hotelStock: { step: "history", count: (c) => legacyCount(c, "otel_zimmet_stok") },
  legacyArchive: {
    step: "history",
    count: async (c) => (await legacyCount(c, "personel_zimmet")) + (await legacyCount(c, "zimmet_sablonlari")),
  },
  occupancyUpload: { step: "tasks", count: (c) => legacyCount(c, "dosya_yuklemeleri") },
  guestRecord: { step: "tasks", count: (c) => legacyCount(c, "misafir_kayitlari") },
  uploadTask: { step: "tasks", count: (c) => legacyCount(c, "yukleme_gorevleri") },
  dailyTaskItem: { step: "tasks", count: (c) => legacyCount(c, "gorev_detaylari") },
  taskStatusLog: { step: "tasks", count: (c) => legacyCount(c, "gorev_durum_loglari") },
  roomDnd: {
    step: "tasks",
    count: async (c) => {
      const withDnd = (await c.legacy.tableExists("gorev_detaylari"))
        ? Number((await c.legacy.query<{ n: string }>(`SELECT count(*) AS n FROM "${c.cfg.legacySchema}"."gorev_detaylari" WHERE "dnd_sayisi" > 0`))[0]?.n ?? 0)
        : 0;
      return (await legacyCount(c, "oda_dnd_kayitlari")) + withDnd;
    },
  },
  roomDndCheck: {
    step: "tasks",
    count: async (c) => (await legacyCount(c, "oda_dnd_kontrolleri")) + (await legacyCount(c, "dnd_kontroller")),
  },
  qrScanLog: { step: "tasks", logs: true, count: (c) => legacyCount(c, "qr_kod_okutma_loglari") },
  auditLog: {
    step: "tasks",
    logs: true,
    count: async (c) => (await legacyCount(c, "audit_logs")) + (await legacyCount(c, "sistem_loglari")),
  },
};

/** Target table of each entity whose id map points at one row (a mapped id with no row means the row was lost). */
const ENTITY_TABLE: Record<string, string> = {
  hotel: "hotels",
  floor: "floors",
  room: "rooms",
  productGroup: "product_groups",
  product: "products",
  setup: "setups",
  user: "users",
  stockRequest: "stock_requests",
  emailLog: "email_logs",
  mybarRequest: "mybar_requests",
  minibarTx: "minibar_transactions",
  roomCheck: "room_checks",
  hotelStock: "hotel_stocks",
  hotelStockMovement: "hotel_stock_movements",
  occupancyUpload: "occupancy_uploads",
  guestRecord: "guest_records",
  uploadTask: "upload_tasks",
  dailyTask: "daily_tasks",
  dailyTaskItem: "daily_task_items",
  taskStatusLog: "task_status_logs",
  roomDnd: "room_dnds",
  roomDndCheck: "room_dnd_checks",
  qrScanLog: "qr_scan_logs",
  auditLog: "audit_logs",
};

async function checkCounts(ctx: StepContext, ran: string[]): Promise<ValidationResult> {
  const counts = ctx.report.counts();
  const bad: string[] = [];
  // Rows the id map knows but the target no longer has (the counters cannot see these).
  for (const [entity, table] of Object.entries(ENTITY_TABLE)) {
    const src = ENTITY_SOURCES[entity] ?? { step: entity === "hotelStockMovement" ? "history" : "definitions" };
    if (!ran.includes(src.step) || ((src as { logs?: boolean }).logs && ctx.cfg.skipLogs)) continue;
    const lost = await ctx.tx((db) =>
      db.$queryRawUnsafe<{ n: bigint }[]>(
        `SELECT count(*) AS n FROM legacy_id_map m WHERE m.entity = $1 AND NOT EXISTS (SELECT 1 FROM "${table}" t WHERE t.id = m.new_id)`,
        entity,
      ),
    );
    const n = Number(lost[0]?.n ?? 0);
    if (n > 0) bad.push(`${entity}: eşleme tablosunda olup hedefte bulunmayan ${n} kayıt`);
  }
  for (const [entity, src] of Object.entries(ENTITY_SOURCES)) {
    const c = counts[entity];
    if (!c || !ran.includes(src.step) || (src.logs && ctx.cfg.skipLogs)) continue;
    const legacy = await src.count(ctx);
    const accounted = c.created + c.existing + c.dropped;
    if (legacy !== accounted) bad.push(`${entity}: legacy ${legacy}, aktarılan+zaten vardı+taşınmadı ${accounted} (fark ${legacy - accounted})`);
  }
  return outcome("SAYI_FARKI", "Her varlıkta legacy satır sayısı = aktarılan + zaten vardı + taşınmadı", bad, "FAIL");
}

async function mapped(ctx: StepContext, entity: Parameters<ReturnType<StepContext["ids"]>["load"]>[0]): Promise<Map<string, string>> {
  return ctx.tx((db) => ctx.ids(db).load(entity));
}

async function checkPools(ctx: StepContext): Promise<ValidationResult[]> {
  const results: ValidationResult[] = [];
  const legacy = await legacyRows(ctx, "otel_zimmet_stok", ["otel_id", "urun_id", "toplam_miktar", "kullanilan_miktar", "kalan_miktar"]);
  const stockOf = await mapped(ctx, "hotelStock");
  const ids = [...stockOf.values()];
  const rows = new Map<string, { used: number; remaining: number; label: string }>();
  for (const part of chunked(ids, 5000)) {
    const found = await ctx.tx((db) =>
      db.hotelStock.findMany({
        where: { id: { in: part } },
        select: { id: true, usedQty: true, remainingQty: true, hotel: { select: { code: true } }, product: { select: { name: true } } },
      }),
    );
    for (const r of found) rows.set(r.id, { used: r.usedQty, remaining: r.remainingQty, label: `${r.hotel.code}/${r.product.name}` });
  }

  const bad: string[] = [];
  const inconsistent: string[] = [];
  const seen = new Set<string>();
  for (const l of legacy) {
    const key = `${idOf(l.otel_id)}:${idOf(l.urun_id)}`;
    const used = num(l.kullanilan_miktar) ?? 0;
    const remaining = num(l.kalan_miktar) ?? 0;
    if ((num(l.toplam_miktar) ?? 0) !== used + remaining) inconsistent.push(key);
    const id = stockOf.get(key);
    if (!id || seen.has(key)) continue;
    seen.add(key);
    const target = rows.get(id);
    if (!target) {
      bad.push(`${key}: hedefte satır yok`);
      continue;
    }
    const wantUsed = Math.max(0, used);
    const wantRemaining = Math.max(0, remaining);
    if (target.used !== wantUsed || target.remaining !== wantRemaining) {
      bad.push(`${target.label}: legacy kullanılan ${wantUsed}/kalan ${wantRemaining}, hedef ${target.used}/${target.remaining}`);
    }
  }
  results.push(outcome("HAVUZ_FARKI", "Havuz satırlarında kullanılan ve kalan miktarlar legacy ile eşit", bad, "FAIL"));
  results.push(
    inconsistent.length === 0
      ? pass("HAVUZ_TUTARSIZ", "Legacy havuz satırlarında toplam = kullanılan + kalan")
      : {
          code: "HAVUZ_TUTARSIZ",
          level: "WARN",
          message: `Legacy havuz satırlarının ${inconsistent.length} tanesinde toplam ≠ kullanılan + kalan; toplam = kullanılan + kalan yazıldı`,
        },
  );

  if (ids.length > 0) {
    const diffs = await ctx.tx(async (db) => {
      const out: string[] = [];
      for (const part of chunked(ids, 5000)) {
        const r = await db.$queryRaw<{ label: string; remaining: number; moved: bigint }[]>(Prisma.sql`
          SELECT h.code || '/' || p.name AS label, s.remaining_qty AS remaining, COALESCE(SUM(m.qty), 0) AS moved
          FROM hotel_stocks s
          JOIN hotels h ON h.id = s.hotel_id
          JOIN products p ON p.id = s.product_id
          LEFT JOIN hotel_stock_movements m ON m.hotel_id = s.hotel_id AND m.product_id = s.product_id
          WHERE s.id = ANY(${part}::text[])
          GROUP BY h.code, p.name, s.remaining_qty
          HAVING COALESCE(SUM(m.qty), 0) <> s.remaining_qty`);
        out.push(...r.map((d) => `${d.label}: kalan ${d.remaining}, Σ hareket ${Number(d.moved)}`));
      }
      return out;
    });
    results.push(outcome("HAREKET_BAKIYE_FARKI", "Havuz kalanı = Σ hareket (eski kayıtlar eksik olabilir)", diffs, "WARN"));
  } else {
    results.push(pass("HAREKET_BAKIYE_FARKI", "Havuz kalanı = Σ hareket (taşınan havuz satırı yok)"));
  }
  return results;
}

async function checkTokens(ctx: StepContext): Promise<ValidationResult> {
  const legacy = await legacyRows(ctx, "odalar", ["id", "oda_no", "qr_kod_token"]);
  const roomOf = await mapped(ctx, "room");
  const owners = new Map<string, { id: string; no: string }[]>();
  for (const r of legacy) {
    const token = clean(r.qr_kod_token);
    if (token === "") continue;
    owners.set(token, [...(owners.get(token) ?? []), { id: idOf(r.id), no: clean(r.oda_no) }]);
  }
  const tokens = [...owners.entries()].filter(([, list]) => list.some((o) => roomOf.has(o.id))).map(([t]) => t);
  const present = new Map<string, string>(); // token -> room id holding it in the target
  for (const part of chunked(tokens, 5000)) {
    const found = await ctx.tx((db) => db.room.findMany({ where: { qrToken: { in: part } }, select: { id: true, qrToken: true } }));
    for (const r of found) if (r.qrToken) present.set(r.qrToken, r.id);
  }
  const tokenOfRoom = new Map<string, string | null>();
  const migratedIds = [...new Set(tokens.flatMap((t) => owners.get(t)!.flatMap((o) => (roomOf.has(o.id) ? [roomOf.get(o.id)!] : []))))];
  for (const part of chunked(migratedIds, 5000)) {
    for (const r of await ctx.tx((db) => db.room.findMany({ where: { id: { in: part } }, select: { id: true, qrToken: true } }))) {
      tokenOfRoom.set(r.id, r.qrToken);
    }
  }
  const lost: string[] = [];
  const kept: string[] = [];
  for (const token of tokens) {
    const migrated = owners.get(token)!.filter((o) => roomOf.has(o.id));
    const holder = present.get(token);
    if (holder && migrated.some((o) => roomOf.get(o.id) === holder)) continue;
    const label = `oda ${migrated.map((o) => o.no).join("/")}`;
    // The target room keeps a QR token of its own, or another room already holds this one: reported, not lost.
    const otherToken = migrated.some((o) => tokenOfRoom.get(roomOf.get(o.id)!) != null);
    if (holder || otherToken) kept.push(`${label}: legacy QR token taşınmadı, hedefte başka bir QR token var`);
    else lost.push(`${label}: QR token hedefte bulunamadı`);
  }
  if (lost.length > 0) return outcome("TOKEN_KAYIP", "Her legacy QR token'ı taşınan odada aynen var", lost, "FAIL");
  return outcome("TOKEN_KAYIP", "Her legacy QR token'ı taşınan odada aynen var (hedefte zaten başka token'ı olan odalar hariç)", kept, "WARN");
}

async function checkRooms(ctx: StepContext): Promise<ValidationResult> {
  const legacy = await ctx.legacy.query<{ otel_id: unknown; n: string }>(
    `SELECT k."otel_id" AS otel_id, count(*) AS n FROM "${ctx.cfg.legacySchema}"."odalar" o JOIN "${ctx.cfg.legacySchema}"."katlar" k ON k."id" = o."kat_id" GROUP BY k."otel_id"`,
  );
  const hotelOf = await mapped(ctx, "hotel");
  const roomOf = await mapped(ctx, "room");
  const perHotel = await ctx.tx(async (db) => {
    const rooms = await db.room.findMany({ where: { id: { in: [...roomOf.values()] } }, select: { hotelId: true } });
    const out = new Map<string, number>();
    for (const r of rooms) out.set(r.hotelId, (out.get(r.hotelId) ?? 0) + 1);
    const codes = new Map((await db.hotel.findMany({ select: { id: true, code: true } })).map((h) => [h.id, h.code]));
    return { out, codes };
  });
  const bad: string[] = [];
  for (const l of legacy) {
    const hotelId = hotelOf.get(idOf(l.otel_id));
    if (!hotelId) continue;
    const want = Number(l.n);
    const got = perHotel.out.get(hotelId) ?? 0;
    if (want !== got) bad.push(`${perHotel.codes.get(hotelId) ?? hotelId}: legacy ${want} oda, taşınan ${got} (kopya/katsız odalar taşınmaz)`);
  }
  return outcome("ODA_SAYISI", "Otel başına oda sayısı legacy ile eşit", bad, "WARN");
}

async function checkMybar(ctx: StepContext): Promise<ValidationResult> {
  const legacy = await legacyRows(ctx, "minibar_dolum_talepleri", ["id", "durum"]);
  const requestOf = await mapped(ctx, "mybarRequest");
  const want = new Map<string, number>();
  for (const r of legacy) {
    if (!requestOf.has(idOf(r.id))) continue;
    const s = dolumStatusFor(clean(r.durum)).status;
    want.set(s, (want.get(s) ?? 0) + 1);
  }
  const got = new Map<string, number>();
  for (const part of chunked([...requestOf.values()], 5000)) {
    const g = await ctx.tx((db) => db.mybarRequest.groupBy({ by: ["status"], where: { id: { in: part } }, _count: { _all: true } }));
    for (const r of g) got.set(r.status, (got.get(r.status) ?? 0) + r._count._all);
  }
  const bad: string[] = [];
  for (const s of new Set([...want.keys(), ...got.keys()])) {
    if ((want.get(s) ?? 0) !== (got.get(s) ?? 0)) bad.push(`${s}: legacy ${want.get(s) ?? 0}, hedef ${got.get(s) ?? 0}`);
  }
  return outcome("MYBAR_DURUM_SAYILARI", "MyBar talep sayıları durum başına eşit", bad, "FAIL");
}

async function checkTxTypes(ctx: StepContext): Promise<ValidationResult> {
  if (!(await ctx.legacy.tableExists("minibar_islemleri"))) return pass("ISLEM_TIP_SAYILARI", "İşlem tipi sayıları (legacy tablo yok)");
  const legacy = await ctx.legacy.query<{ tip: unknown; n: string }>(
    `SELECT "islem_tipi" AS tip, count(*) AS n FROM "${ctx.cfg.legacySchema}"."minibar_islemleri" GROUP BY "islem_tipi"`,
  );
  const want = new Map<string, number>();
  for (const l of legacy) want.set(fold(clean(l.tip)), (want.get(fold(clean(l.tip))) ?? 0) + Number(l.n));
  const grouped = await ctx.tx((db) => db.minibarTransaction.groupBy({ by: ["type", "legacyType"], _count: { _all: true } }));
  const got = new Map<string, number>();
  for (const g of grouped) {
    const tip =
      g.type === "SETUP_KONTROL" ? "setup_kontrol" : g.type === "SARFIYAT_YOK" ? "sarfiyat_yok" : g.type === "MYBAR_KARSILAMA" ? "ekstra_ekleme" : fold(g.legacyType ?? "");
    got.set(tip, (got.get(tip) ?? 0) + g._count._all);
  }
  const bad: string[] = [];
  let missing = 0;
  for (const tip of new Set([...want.keys(), ...got.keys()])) {
    const w = want.get(tip) ?? 0;
    const g = got.get(tip) ?? 0;
    if (g > w) bad.push(`${tip || "(boş)"}: legacy ${w}, hedef ${g}`);
    missing += Math.max(0, w - g);
  }
  // Counters exist only in the run that migrated (a standalone validation has none): then the missing rows must be the dropped ones.
  const counter = ctx.report.counts().minibarTx;
  if (counter && bad.length === 0 && missing !== counter.dropped) {
    bad.push(`tip başına eksik toplam ${missing}, taşınmadı olarak raporlanan ${counter.dropped}`);
  }
  return outcome("ISLEM_TIP_SAYILARI", "İşlem tipi sayıları legacy ile uyumlu (fark yalnız taşınmayanlar)", bad, "FAIL");
}

async function checkHashes(ctx: StepContext): Promise<ValidationResult> {
  const legacy = await legacyRows(ctx, "kullanicilar", ["id", "kullanici_adi", "sifre_hash"]);
  const userOf = await mapped(ctx, "user");
  const targets = new Map<string, string>();
  for (const part of chunked([...userOf.values()], 5000)) {
    for (const u of await ctx.tx((db) => db.user.findMany({ where: { id: { in: part } }, select: { id: true, passwordHash: true } }))) {
      targets.set(u.id, u.passwordHash);
    }
  }
  const bad: string[] = [];
  for (const l of legacy) {
    const id = userOf.get(idOf(l.id));
    if (!id) continue;
    if (targets.get(id) !== clean(l.sifre_hash)) bad.push(`kullanıcı ${clean(l.kullanici_adi)}: parola özeti legacy ile aynı değil`);
  }
  return outcome("HASH_FARKI", "Taşınan kullanıcıların parola özetleri legacy ile aynen eşit", bad, "FAIL");
}

async function checkLogos(ctx: StepContext): Promise<ValidationResult> {
  const hotelOf = await mapped(ctx, "hotel");
  const hotels = await ctx.tx((db) => db.hotel.findMany({ where: { id: { in: [...hotelOf.values()] } }, select: { code: true, logoUrl: true } }));
  const bad: string[] = [];
  for (const h of hotels) {
    // Only the file the migration itself writes (<kod>.png); a logo set by hand or by the seed is not its job.
    if (h.logoUrl !== `/brand/hotels/${h.code.toLowerCase()}.png`) continue;
    const file = path.resolve(ctx.cfg.logoDir, path.basename(h.logoUrl));
    const ok = await fs.access(file).then(() => true, () => false);
    if (!ok) bad.push(`${h.code}: ${h.logoUrl} dosyası yok`);
  }
  return outcome("LOGO_DOSYASI_YOK", "Logosu olan her otelin dosyası var", bad, "FAIL");
}

/**
 * Checks of the steps that actually ran. Legacy counts are read straight from the legacy database, never from the
 * step counters. Messages never contain hashes, tokens or connection strings.
 */
export async function runValidation(ctx: StepContext, ran: string[]): Promise<ValidationResult[]> {
  const results: ValidationResult[] = [];
  results.push(await checkCounts(ctx, ran));
  if (ran.includes("definitions")) {
    results.push(await checkTokens(ctx));
    results.push(await checkRooms(ctx));
    if (!ctx.dryRun) results.push(await checkLogos(ctx));
  }
  if (ran.includes("users")) results.push(await checkHashes(ctx));
  if (ran.includes("history")) {
    results.push(...(await checkPools(ctx)));
    results.push(await checkMybar(ctx));
    results.push(await checkTxTypes(ctx));
  }
  return results;
}

/** Writes the results into the report (WARN results never fail the run) and adds the follow-up list. */
export async function recordValidation(ctx: StepContext, ran: string[], results: ValidationResult[]): Promise<void> {
  for (const r of results) {
    ctx.report.check({
      name: `${r.code} — ${r.message}`,
      ok: r.level === "PASS",
      ...(r.level === "WARN" ? { level: "WARN" as const } : {}),
      ...(r.detail ? { detail: r.detail.join("; ") } : {}),
    });
  }
  await addTodos(ctx, ran);
}

async function addTodos(ctx: StepContext, ran: string[]): Promise<void> {
  const report: Report = ctx.report;
  if (ran.includes("definitions")) {
    const roomOf = await mapped(ctx, "room");
    let legacyFormat = 0;
    for (const part of chunked([...roomOf.values()], 5000)) {
      const rooms = await ctx.tx((db) => db.room.findMany({ where: { id: { in: part }, qrToken: { not: null } }, select: { qrToken: true } }));
      legacyFormat += rooms.filter((r) => /^\d{6}$/.test(r.qrToken ?? "")).length;
    }
    if (legacyFormat > 0) {
      report.todo(`${legacyFormat} odanın QR kodu eski biçimli (6 haneli); Minibar Tanımları › Oda QR'dan yeniden üretin ve yeni QR'ları basıp yerleştirin.`);
    }
  }
  if (ran.includes("users")) {
    const reset = report.warningCount("SIFRE_SIFIRLANMALI");
    if (reset > 0) {
      const names = report.warningExamples("SIFRE_SIFIRLANMALI");
      report.todo(`${reset} kullanıcının şifresi bu uygulamada doğrulanamıyor (scrypt/diğer biçim); şifreleri sıfırlanmalı: ${names.join(", ")}${reset > names.length ? ", ..." : ""}`);
    }
    const sysadmins = report.warningCount("SUPERADMIN_PASIF");
    if (sysadmins > 0) report.todo(`Pasif taşınan superadmin hesapları (${report.warningExamples("SUPERADMIN_PASIF").join(", ")}): gerekirse sistem yöneticisi olarak elle etkinleştirin.`);
    const days = ctx.cfg.notificationsDays;
    const cutoff = businessDate(new Date(Date.now() - days * 86_400_000));
    report.todo(`Bildirimler yalnız son ${days} gün (${cutoff} ve sonrası) taşındı; daha eski bildirimler taşınmadı.`);
  }
}
