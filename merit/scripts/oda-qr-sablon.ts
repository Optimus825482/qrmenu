/**
 * Oda QR kartlarını otelin 11 x 13 cm baskı şablonunda, verilen alan adıyla toplu üretir:
 * her otel için TR ve EN birer PDF (oda başına bir sayfa, kat ve oda numarası sırasıyla).
 *
 *   npx tsx scripts/oda-qr-sablon.ts https://qrmenu.merithotels.com [çıktı klasörü]
 *
 * Yalnız okur: oda kodlarını (qr_token) değiştirmez. Üretilen PDF'ler oda kodlarını içerir;
 * depoya eklenmez (cikti/ .gitignore'da).
 */
import "dotenv/config";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import pg from "pg";
import { hasRoomTemplate, renderRoomTemplatePdf, type RoomTemplateLang } from "../src/lib/qrTemplatePdf";

const base = (process.argv[2] ?? "").replace(/\/+$/, "");
if (!/^https:\/\/[^/]+$/.test(base)) {
  console.error("Kullanım: npx tsx scripts/oda-qr-sablon.ts https://alan-adi [çıktı klasörü]");
  process.exit(1);
}
const outDir = path.resolve(process.argv[3] ?? path.join(__dirname, "../../cikti/oda-qr-sablon"));

type Row = { code: string; name: string; number: string; token: string; floor: number | null };

async function main() {
  const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  const { rows } = await db.query<Row>(
    `SELECT h.code, h.name, r.number, r.qr_token AS token, f.number AS floor
       FROM rooms r
       JOIN hotels h ON h.id = r.hotel_id
       LEFT JOIN floors f ON f.id = r.floor_id
      WHERE r.is_active AND r.qr_token IS NOT NULL
      ORDER BY h.code, f.number NULLS LAST, r.number`,
  );
  await db.end();

  const byHotel = new Map<string, Row[]>();
  for (const row of rows) byHotel.set(row.code, [...(byHotel.get(row.code) ?? []), row]);

  await mkdir(outDir, { recursive: true });
  const host = new URL(base).host;
  for (const [code, list] of byHotel) {
    if (!hasRoomTemplate(code)) {
      console.warn(`${code}: baskı şablonu yok, atlandı (${list.length} oda)`);
      continue;
    }
    // Natural order inside a floor: 101, 102, … 1001 (not 1001 before 101).
    list.sort(
      (a, b) =>
        (a.floor ?? Number.MAX_SAFE_INTEGER) - (b.floor ?? Number.MAX_SAFE_INTEGER) ||
        a.number.localeCompare(b.number, "tr", { numeric: true }),
    );
    const cards = list.map((r) => ({ label: r.number, url: `${base}/q/${r.token}` }));
    for (const lang of ["tr", "en"] as RoomTemplateLang[]) {
      const pdf = await renderRoomTemplatePdf({
        hotelCode: code,
        lang,
        title: `${list[0].name} - Oda QR Kartları (${lang.toUpperCase()})`,
        cards,
      });
      const file = path.join(outDir, `Oda_QR_Sablon_${code}_${lang.toUpperCase()}_${host}.pdf`);
      await writeFile(file, pdf);
      console.log(`${file}  ${cards.length} sayfa  ${list[0].number} … ${list[list.length - 1].number}`);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
