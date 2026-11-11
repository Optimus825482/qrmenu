/**
 * Örnek / deneme kullanıcılarını ve onlara ait işlemleri kalıcı olarak siler.
 *
 *   npx tsx scripts/ornek-kullanici-temizle.ts                 # yalnız listeler, hiçbir şey silmez
 *   npx tsx scripts/ornek-kullanici-temizle.ts --uygula        # siler (tek transaction)
 *   npx tsx scripts/ornek-kullanici-temizle.ts --koru ali.veli,ayse.kaya
 *   npx tsx scripts/ornek-kullanici-temizle.ts --sil superadmindepo   # eski sistemden aktarılmış olsa da siler
 *
 * KORUNANLAR: "admin", "admin2", --koru ile sayılanlar ve eski minibar sisteminden aktarılan kullanıcılar
 * (legacy_id_map). Geri kalan her kullanıcı silinir. --sil ile adı verilen kullanıcı, aktarılmış olsa da silinir
 * (admin ve admin2 hiçbir zaman silinmez); ONA AİT AKTARILMIŞ ESKİ İŞLEMLER DE GİDER, deneme çıktısındaki sayılara bakın.
 *
 * SİLİNEN İŞLEMLER (silinecek kullanıcının yaptığı): minibar işlemleri (kalemleriyle), oda kontrolleri, DND
 * kontrolleri, havuz stok hareketleri, stok talepleri, düzeltme talepleri, doluluk yüklemeleri, masa atamaları,
 * oturumlar. Bildirimler, outlet üyelikleri ve otel bağlantıları kullanıcıyla birlikte gider.
 * SİLİNMEYENLER: siparişler, MyBar talepleri, denetim günlüğü — bunlarda yalnız personel alanı boşalır.
 *
 * Havuz stok hareketi silinirse hotel_stocks bakiyesi YENİDEN HESAPLANMAZ; etkilenen ürün sayısı raporda yazar.
 */
import { Client } from "pg";

const ALWAYS_KEEP = ["admin", "admin2"];

/** Kullanıcının zorunlu (NOT NULL) sahibi olduğu tablolar; silme sırası alt → üst. */
const OWNED: { table: string; column: string; label: string }[] = [
  { table: "minibar_correction_requests", column: "requested_by_id", label: "Düzeltme talebi" },
  { table: "room_checks", column: "user_id", label: "Oda kontrolü" },
  { table: "room_dnd_checks", column: "user_id", label: "DND kontrolü" },
  { table: "minibar_transactions", column: "user_id", label: "Minibar işlemi" },
  { table: "hotel_stock_movements", column: "user_id", label: "Havuz stok hareketi" },
  { table: "stock_requests", column: "requested_by_id", label: "Stok talebi" },
  { table: "occupancy_uploads", column: "user_id", label: "Doluluk yüklemesi" },
  { table: "table_assignments", column: "user_id", label: "Masa ataması" },
  { table: "user_sessions", column: "user_id", label: "Oturum" },
];

export function parseArgs(argv: string[]): { apply: boolean; keep: string[]; force: string[] } {
  let apply = false;
  const keep = [...ALWAYS_KEEP];
  const force: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--uygula") apply = true;
    else if (arg === "--koru") {
      const value = argv[++i];
      if (!value || value.startsWith("--")) throw new Error("--koru: virgülle ayrılmış kullanıcı adları gerekli");
      keep.push(...value.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean));
    } else if (arg === "--sil") {
      const value = argv[++i];
      if (!value || value.startsWith("--")) throw new Error("--sil: virgülle ayrılmış kullanıcı adları gerekli");
      force.push(...value.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean));
    } else throw new Error(`Bilinmeyen bayrak: ${arg}`);
  }
  const clash = force.filter((name) => keep.includes(name));
  if (clash.length > 0) throw new Error(`--sil: korunan kullanıcı silinemez: ${clash.join(", ")}`);
  return { apply, keep: [...new Set(keep)], force: [...new Set(force)] };
}

async function main(): Promise<number> {
  const { apply, keep, force } = parseArgs(process.argv.slice(2));
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    console.error("DATABASE_URL tanımlı değil.");
    return 2;
  }
  const db = new Client({ connectionString: url });
  await db.connect();
  try {
    await db.query("BEGIN");
    const kept = await db.query(
      `SELECT u."username", r."code" AS role,
              CASE WHEN m."new_id" IS NOT NULL THEN 'eski sistemden aktarıldı' ELSE 'korunan ad' END AS neden
       FROM "users" u JOIN "roles" r ON r."id" = u."role_id"
       LEFT JOIN "legacy_id_map" m ON m."entity" = 'user' AND m."new_id" = u."id"
       WHERE lower(u."username") = ANY($1) OR (m."new_id" IS NOT NULL AND lower(u."username") <> ALL($2))
       ORDER BY u."username"`,
      [keep, force],
    );
    if (!kept.rows.some((r) => String(r.username).toLowerCase() === "admin")) {
      console.error('GÜVENLİK: "admin" kullanıcısı bulunamadı; hiçbir şey silinmedi.');
      await db.query("ROLLBACK");
      return 1;
    }
    await db.query(
      `CREATE TEMP TABLE "_silinecek" ON COMMIT DROP AS
       SELECT u."id" FROM "users" u
       WHERE lower(u."username") <> ALL($1)
         AND (lower(u."username") = ANY($2)
              OR NOT EXISTS (SELECT 1 FROM "legacy_id_map" m WHERE m."entity" = 'user' AND m."new_id" = u."id"))`,
      [keep, force],
    );
    const victims = await db.query(
      `SELECT u."username", u."full_name", r."code" AS role, u."last_login_at"
       FROM "users" u JOIN "roles" r ON r."id" = u."role_id"
       WHERE u."id" IN (SELECT "id" FROM "_silinecek") ORDER BY r."code", u."username"`,
    );

    console.log(`KORUNACAK (${kept.rows.length}):`);
    for (const r of kept.rows) console.log(`  ${r.username}  [${r.role}]  ${r.neden}`);
    console.log(`\nSİLİNECEK (${victims.rows.length}):`);
    for (const r of victims.rows) {
      const last = r.last_login_at ? new Date(r.last_login_at).toISOString().slice(0, 10) : "hiç giriş yok";
      console.log(`  ${r.username}  [${r.role}]  ${r.full_name}  son giriş: ${last}`);
    }
    if (victims.rows.length === 0) {
      console.log("\nSilinecek kullanıcı yok.");
      await db.query("ROLLBACK");
      return 0;
    }

    const stockPairs = await db.query(
      `SELECT count(DISTINCT ("hotel_id", "product_id"))::int AS n FROM "hotel_stock_movements"
       WHERE "user_id" IN (SELECT "id" FROM "_silinecek")`,
    );
    console.log("\nBu kullanıcılara ait işlemler:");
    for (const o of OWNED) {
      const res = await db.query(`DELETE FROM "${o.table}" WHERE "${o.column}" IN (SELECT "id" FROM "_silinecek")`);
      console.log(`  ${o.label}: ${res.rowCount ?? 0}`);
    }
    const gone = await db.query(`DELETE FROM "users" WHERE "id" IN (SELECT "id" FROM "_silinecek")`);
    if ((stockPairs.rows[0]?.n ?? 0) > 0) {
      console.log(`\nDİKKAT: ${stockPairs.rows[0].n} otel/ürün çiftinin havuz hareketi siliniyor; bakiyeler yeniden hesaplanmaz.`);
    }

    if (!apply) {
      await db.query("ROLLBACK");
      console.log("\nDENEME: hiçbir şey silinmedi. Gerçekten silmek için aynı komutu --uygula ile çalıştırın.");
      return 0;
    }
    await db.query("COMMIT");
    console.log(`\nSİLİNDİ: ${gone.rowCount ?? 0} kullanıcı ve yukarıdaki işlemler kalıcı olarak kaldırıldı.`);
    return 0;
  } catch (error) {
    await db.query("ROLLBACK").catch(() => undefined);
    console.error(`HATA (hiçbir şey silinmedi): ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  } finally {
    await db.end().catch(() => undefined);
  }
}

if (/^ornek-kullanici-temizle\.[cm]?[jt]s$/.test((process.argv[1] ?? "").split(/[\\/]/).pop() ?? "")) {
  main().then(
    (code) => process.exit(code),
    (error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    },
  );
}
