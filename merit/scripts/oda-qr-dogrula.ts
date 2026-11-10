/**
 * Basılı oda kartlarındaki QR kodlarını (assets/qr-templates/basili-oda-kodlari.json) veritabanıyla
 * karşılaştırır. Canlı kurulumdan ve her veri aktarımından sonra çalıştırın:
 *
 *   npx tsx scripts/oda-qr-dogrula.ts          # yalnız rapor (hiçbir şeyi değiştirmez)
 *   npx tsx scripts/oda-qr-dogrula.ts --yaz    # farklı/eksik kodları basılı koda geri yazar
 *
 * --yaz yalnız odası bulunan ve kodu başka bir odada kullanılmayan satırları düzeltir; geri kalanı
 * raporlar. Çıkış kodu: 0 = hepsi basılı kartla aynı, 1 = fark var.
 */
import "dotenv/config";
import pg from "pg";
import { loadPrintedRoomCodes } from "../src/modules/minibar/server/printedRoomCodes";

const write = process.argv.includes("--yaz");

type Room = { id: string; code: string; number: string; token: string | null; active: boolean };

async function main() {
  const printed = loadPrintedRoomCodes();
  const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  try {
    const { rows } = await db.query<Room>(
      `SELECT r.id, upper(h.code) AS code, r.number, r.qr_token AS token, r.is_active AS active
         FROM rooms r JOIN hotels h ON h.id = r.hotel_id`,
    );
    const byKey = new Map(rows.map((r) => [`${r.code}:${r.number}`, r]));
    const byToken = new Map(rows.flatMap((r) => (r.token ? [[r.token, r] as const] : [])));

    let same = 0;
    const missing: string[] = [];
    const inactive: string[] = [];
    const taken: string[] = [];
    const fixable: { room: Room; code: string }[] = [];
    for (const [hotel, codes] of Object.entries(printed.hotels)) {
      for (const [number, code] of Object.entries(codes)) {
        const room = byKey.get(`${hotel}:${number}`);
        if (!room) {
          missing.push(`${hotel} ${number}`);
          continue;
        }
        if (!room.active) inactive.push(`${hotel} ${number}`);
        if (room.token === code) {
          same++;
          continue;
        }
        const holder = byToken.get(code);
        if (holder && holder.id !== room.id) taken.push(`${hotel} ${number} (kod ${holder.code} ${holder.number} odasında)`);
        else fixable.push({ room, code });
      }
    }

    const total = Object.values(printed.hotels).reduce((n, codes) => n + Object.keys(codes).length, 0);
    console.log(`Basılı kart: ${total} oda (${printed.printedAt}, ${printed.baseUrl})`);
    console.log(`Aynı: ${same}`);
    console.log(`Kodu farklı ya da boş (düzeltilebilir): ${fixable.length}`);
    for (const f of fixable.slice(0, 20)) console.log(`   ${f.room.code} ${f.room.number}`);
    console.log(`Oda veritabanında yok: ${missing.length}${missing.length ? `  →  ${missing.slice(0, 20).join(", ")}` : ""}`);
    console.log(`Kod başka odada: ${taken.length}${taken.length ? `  →  ${taken.slice(0, 20).join(", ")}` : ""}`);
    console.log(`Oda pasif (kart okutulunca açılmaz): ${inactive.length}${inactive.length ? `  →  ${inactive.slice(0, 20).join(", ")}` : ""}`);

    let left = fixable.length;
    if (write && fixable.length > 0) {
      await db.query("BEGIN");
      for (const f of fixable) {
        await db.query(`UPDATE rooms SET qr_token = $1, qr_generated_at = now(), updated_at = now() WHERE id = $2`, [
          f.code,
          f.room.id,
        ]);
      }
      await db.query("COMMIT");
      console.log(`Yazıldı: ${fixable.length} oda basılı koduna döndürüldü.`);
      left = 0;
    } else if (fixable.length > 0) {
      console.log("Düzeltmek için: npx tsx scripts/oda-qr-dogrula.ts --yaz");
    }
    process.exitCode = left + missing.length + taken.length + inactive.length === 0 ? 0 : 1;
  } catch (error) {
    await db.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    await db.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
