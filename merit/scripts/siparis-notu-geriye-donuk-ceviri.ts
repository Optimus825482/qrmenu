/**
 * Oda servisi siparişlerinin ESKİ misafir notlarını (sipariş notu ve kalem notu) Türkçeye çevirip kaydeder.
 * Not çevirisi 14.11.2026'da geldi; daha önce verilen siparişlerin notları misafirin diliyle kalmıştı.
 *
 *   npx tsx scripts/siparis-notu-geriye-donuk-ceviri.ts --dry-run   # yalnız kaç not çevrileceğini yazar
 *   npx tsx scripts/siparis-notu-geriye-donuk-ceviri.ts             # çevirir ve kaydeder
 *   npx tsx scripts/siparis-notu-geriye-donuk-ceviri.ts --once      # deploy: veritabanı başına bir kez
 *
 * Yeni siparişlerle aynı çeviri zinciri (DeepL, yedek Gemini) ve aynı otel ayarı ("notları çevir") kullanılır.
 * Orijinal not `note` alanında aynen kalır; Türkçesi `note_tr` alanına yazılır. Türkçe yazılmış not çevrilmez.
 * Tekrar çalıştırılabilir: yalnız Türkçesi olmayan notlara bakar. Çevrilemeyen not kalırsa işaret yazılmaz ve
 * sonraki açılışta yalnız kalanlar yeniden denenir. Not metni günlüğe yazılmaz (kişisel veri).
 */
import "dotenv/config";
import { prisma } from "@/lib/prisma";
import { translateNoteForStaff } from "@/modules/mybar/server/translateService";
import { noteKey, translatePendingNotes } from "@/modules/order/server/noteBackfill";

const MARKER_KEY = "backfill.orderNoteTranslation.completedAt";
/** Nobody is waiting for the answer here: a slow provider gets more time than at order time. */
const TIMEOUT_MS = 10_000;
const WRITE_CHUNK = 500;

function group(rows: { id: string; hotelId: string; note: string }[]): Map<string, string[]> {
  const byKey = new Map<string, string[]>();
  for (const row of rows) {
    const key = noteKey(row.hotelId, row.note);
    byKey.set(key, [...(byKey.get(key) ?? []), row.id]);
  }
  return byKey;
}

const chunks = <T>(items: T[]): T[][] =>
  Array.from({ length: Math.ceil(items.length / WRITE_CHUNK) }, (_, i) => items.slice(i * WRITE_CHUNK, (i + 1) * WRITE_CHUNK));

async function main(): Promise<number> {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const once = args.includes("--once");
  const unknown = args.filter((a) => a !== "--dry-run" && a !== "--once");
  if (unknown.length) throw new Error(`Bilinmeyen bayrak: ${unknown.join(", ")}`);
  if (once && (await prisma.setting.findFirst({ where: { hotelId: null, key: MARKER_KEY }, select: { id: true } }))) {
    console.log("Eski sipariş notlarının çevirisi daha önce tamamlanmış; atlandı.");
    return 0;
  }

  // noteSrcLang "tr" = an earlier run already found this order note to be Turkish.
  const orders = await prisma.order.findMany({
    where: { kind: "ODA_SERVISI", note: { not: null }, noteTr: null, noteSrcLang: null },
    select: { id: true, hotelId: true, note: true },
  });
  const items = await prisma.orderItem.findMany({
    where: { note: { not: null }, noteTr: null, order: { kind: "ODA_SERVISI" } },
    select: { id: true, note: true, order: { select: { hotelId: true } } },
  });
  const orderRows = orders.flatMap((o) => (o.note?.trim() ? [{ id: o.id, hotelId: o.hotelId, note: o.note }] : []));
  const itemRows = items.flatMap((i) => (i.note?.trim() ? [{ id: i.id, hotelId: i.order.hotelId, note: i.note }] : []));
  const ordersByKey = group(orderRows);
  const itemsByKey = group(itemRows);
  const distinct = new Set([...ordersByKey.keys(), ...itemsByKey.keys()]).size;
  console.log(`Türkçesi olmayan not: ${orderRows.length} sipariş notu, ${itemRows.length} kalem notu (${distinct} farklı metin).`);
  if (dryRun) {
    console.log("Deneme çalıştırması: hiçbir şey çevrilmedi ve yazılmadı.");
    return 0;
  }

  const result = await translatePendingNotes([...orderRows, ...itemRows], (hotelId, note) =>
    translateNoteForStaff(hotelId, note, { timeoutMs: TIMEOUT_MS }),
  );

  let written = 0;
  for (const [key, { noteTr, srcLang }] of result.translated) {
    for (const ids of chunks(ordersByKey.get(key) ?? [])) {
      written += (await prisma.order.updateMany({ where: { id: { in: ids }, noteTr: null }, data: { noteTr, noteSrcLang: srcLang } })).count;
    }
    for (const ids of chunks(itemsByKey.get(key) ?? [])) {
      written += (await prisma.orderItem.updateMany({ where: { id: { in: ids }, noteTr: null }, data: { noteTr } })).count;
    }
  }
  for (const key of result.turkish) {
    for (const ids of chunks(ordersByKey.get(key) ?? [])) {
      await prisma.order.updateMany({ where: { id: { in: ids }, noteTr: null }, data: { noteSrcLang: "tr" } });
    }
  }
  console.log(
    `Çevrilen metin: ${result.translated.size} (${written} kayıt güncellendi), Türkçe olduğu için dokunulmayan: ${result.turkish.size}, çevrilemeyen: ${result.failed}.`,
  );

  if (result.failed > 0) {
    console.log("Çevrilemeyen not kaldı (çeviri servisi yanıt vermedi ya da otelde not çevirisi kapalı); sonraki açılışta yeniden denenecek.");
    return 0;
  }
  if (once) {
    await prisma.setting.create({ data: { hotelId: null, key: MARKER_KEY, value: new Date().toISOString() } });
    console.log("Tamamlandı işareti yazıldı; sonraki açılışlarda atlanacak.");
  }
  return 0;
}

main()
  .then((code) => prisma.$disconnect().then(() => process.exit(code)))
  .catch(async (error) => {
    console.error(error instanceof Error ? error.message : error);
    await prisma.$disconnect();
    process.exit(1);
  });
