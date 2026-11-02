/**
 * Extracts the real hotel definitions (hotels, floors, room types, rooms, product groups, products,
 * setups, setup contents, room-type -> setup assignments) from the legacy Flask/Postgres minibar
 * database into `prisma/seed/data/legacy-definitions.json` (+ README summary + hotel logos).
 *
 *   LEGACY_DATABASE_URL=postgresql://... npx tsx scripts/extract-legacy-definitions.ts
 *
 * Read-only against the legacy DB. Secrets are never exported: no QR tokens/images, no users, no
 * credentials. Output is deterministic (sorted by natural keys) so re-runs produce a clean diff.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import pg from "pg";

const SOURCE_LABEL = "canlı yedek 02.11.2026";
/** Legacy hotel name -> Merit hotel code (see prisma/seed/hotels.ts). */
const HOTEL_CODE_BY_LEGACY_NAME: Record<string, string> = {
  "Merit Royal Hotel": "ROYAL",
  "Merit Royal Diamond": "DIAMOND",
  "Merit Royal Premium": "PREMIUM",
};

const ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.join(ROOT, "prisma", "seed", "data");
const LOGO_DIR = path.join(ROOT, "public", "brand", "hotels");

const cmp = (a: string, b: string) => a.localeCompare(b, "tr", { numeric: true });
const clean = (v: unknown): string => String(v ?? "").trim();
const orNull = (v: unknown): string | null => clean(v) || null;
const money = (v: unknown): string | null => (v === null || v === undefined ? null : Number(v).toFixed(2));

async function main() {
  const url = process.env.LEGACY_DATABASE_URL;
  if (!url) throw new Error("LEGACY_DATABASE_URL ortam değişkeni gerekli.");
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    const q = async (sql: string) => (await client.query(sql)).rows;

    const hotelRows = await q("SELECT id, ad, aktif, logo FROM oteller ORDER BY id");
    const codeByLegacyId = new Map<number, string>();
    for (const h of hotelRows) {
      const code = HOTEL_CODE_BY_LEGACY_NAME[clean(h.ad)];
      if (!code) throw new Error(`Bilinmeyen eski otel adı: ${h.ad}`);
      codeByLegacyId.set(h.id, code);
    }

    const floorRows = await q("SELECT id, otel_id, kat_adi, kat_no, aktif FROM katlar ORDER BY otel_id, kat_no");
    const floorById = new Map<number, { code: string; number: number }>();
    for (const f of floorRows) floorById.set(f.id, { code: codeByLegacyId.get(f.otel_id)!, number: Number(f.kat_no) });

    const roomRows = await q(
      "SELECT o.kat_id, o.oda_no, o.kapasite, o.aktif, o.misafir_mesaji, o.oda_tipi_id, k.otel_id FROM odalar o JOIN katlar k ON k.id = o.kat_id",
    );
    const typeRows = await q("SELECT id, ad, aktif, dolap_sayisi FROM oda_tipleri");
    const typeById = new Map(typeRows.map((t) => [t.id as number, t]));
    const assignRows = await q("SELECT otel_id, oda_tipi_id, setup_id FROM oda_tipi_setup");

    const groupRows = await q("SELECT id, grup_adi, aciklama, aktif FROM urun_gruplari");
    const groupById = new Map(groupRows.map((g) => [g.id as number, clean(g.grup_adi)]));
    const productRows = await q(
      "SELECT id, grup_id, urun_adi, birim, kritik_stok_seviyesi, aktif, alis_fiyati, satis_fiyati FROM urunler",
    );
    const productById = new Map(productRows.map((p) => [p.id as number, p]));
    const setupRows = await q("SELECT id, ad, aciklama, aktif, dolap_ici FROM setuplar");
    const setupById = new Map(setupRows.map((s) => [s.id as number, clean(s.ad)]));
    const contentRows = await q("SELECT setup_id, urun_id, adet FROM setup_icerik");

    // Room types are global in the legacy DB; per hotel keep only those actually used (rooms or setups).
    const usedTypes = new Map<string, Set<number>>();
    const markType = (code: string, id: number | null) => {
      if (id === null || id === undefined) return;
      if (!usedTypes.has(code)) usedTypes.set(code, new Set());
      usedTypes.get(code)!.add(id);
    };
    for (const r of roomRows) markType(codeByLegacyId.get(r.otel_id)!, r.oda_tipi_id);
    for (const a of assignRows) markType(codeByLegacyId.get(a.otel_id)!, a.oda_tipi_id);

    mkdirSync(DATA_DIR, { recursive: true });
    mkdirSync(LOGO_DIR, { recursive: true });

    const hotels = hotelRows
      .map((h) => {
        const code = codeByLegacyId.get(h.id)!;
        let logoUrl: string | null = null;
        const raw = clean(h.logo).replace(/^data:image\/[a-z+]+;base64,/i, "");
        if (raw) {
          writeFileSync(path.join(LOGO_DIR, `${code.toLowerCase()}.png`), Buffer.from(raw, "base64"));
          logoUrl = `/brand/hotels/${code.toLowerCase()}.png`;
        }
        const floors = floorRows
          .filter((f) => codeByLegacyId.get(f.otel_id) === code)
          .map((f) => ({ number: Number(f.kat_no), name: clean(f.kat_adi), isActive: Boolean(f.aktif) }))
          .sort((a, b) => a.number - b.number);
        const roomTypes = [...(usedTypes.get(code) ?? [])]
          .map((id) => typeById.get(id)!)
          .map((t) => ({ name: clean(t.ad), cabinetCount: Number(t.dolap_sayisi) || 0, isActive: Boolean(t.aktif) }))
          .sort((a, b) => cmp(a.name, b.name));
        const rooms = roomRows
          .filter((r) => codeByLegacyId.get(r.otel_id) === code)
          .map((r) => ({
            number: clean(r.oda_no),
            floorNumber: floorById.get(r.kat_id)!.number,
            roomType: r.oda_tipi_id ? clean(typeById.get(r.oda_tipi_id)?.ad) || null : null,
            capacity: r.kapasite ? Number(r.kapasite) : null,
            guestMessage: orNull(r.misafir_mesaji),
            isActive: Boolean(r.aktif),
          }))
          .sort((a, b) => cmp(a.number, b.number));
        const roomTypeSetups = assignRows
          .filter((a) => codeByLegacyId.get(a.otel_id) === code)
          .map((a) => ({ roomType: clean(typeById.get(a.oda_tipi_id)!.ad), setup: setupById.get(a.setup_id)! }))
          .sort((a, b) => cmp(a.roomType, b.roomType) || cmp(a.setup, b.setup));
        return { code, name: clean(h.ad), isActive: Boolean(h.aktif), logoUrl, floors, roomTypes, rooms, roomTypeSetups };
      })
      .sort((a, b) => cmp(a.code, b.code));

    const productGroups = groupRows
      .map((g) => ({ name: clean(g.grup_adi), description: orNull(g.aciklama), isActive: Boolean(g.aktif) }))
      .sort((a, b) => cmp(a.name, b.name));
    const products = productRows
      .map((p) => ({
        group: groupById.get(p.grup_id)!,
        name: clean(p.urun_adi),
        unit: clean(p.birim) || "Adet",
        criticalLevel: Number(p.kritik_stok_seviyesi) || 10,
        purchasePrice: money(p.alis_fiyati),
        salePrice: money(p.satis_fiyati),
        isActive: Boolean(p.aktif),
      }))
      .sort((a, b) => cmp(a.group, b.group) || cmp(a.name, b.name));
    const setups = setupRows
      .map((s) => ({
        name: clean(s.ad),
        description: orNull(s.aciklama),
        isInsideCabinet: Boolean(s.dolap_ici),
        isActive: Boolean(s.aktif),
        items: contentRows
          .filter((c) => c.setup_id === s.id)
          .map((c) => {
            const p = productById.get(c.urun_id)!;
            return { group: groupById.get(p.grup_id)!, product: clean(p.urun_adi), qty: Number(c.adet) || 1 };
          })
          .sort((a, b) => cmp(a.group, b.group) || cmp(a.product, b.product)),
      }))
      .sort((a, b) => cmp(a.name, b.name));

    const date = new Date().toISOString().slice(0, 10);
    const data = { source: SOURCE_LABEL, extractedAt: date, hotels, productGroups, products, setups };
    writeFileSync(path.join(DATA_DIR, "legacy-definitions.json"), JSON.stringify(data, null, 2) + "\n");

    const rows = hotels.map(
      (h) =>
        `| ${h.code} | ${h.floors.length} | ${h.roomTypes.length} | ${h.rooms.length} | ${h.roomTypeSetups.length} | ${h.logoUrl ? "var" : "yok"} |`,
    );
    const readme = [
      "# Eski minibar tanımları (referans seed verisi)",
      "",
      `- Kaynak: ${SOURCE_LABEL}`,
      `- Çıkarım tarihi: ${date}`,
      "- Üretici: `scripts/extract-legacy-definitions.ts` (`LEGACY_DATABASE_URL` ile çalışır; bağlantı bilgisi bu dosyalarda yer almaz)",
      "- İçerik: otel, kat, oda tipi, oda, ürün grubu, ürün, setup, setup içeriği, oda tipi-setup ataması, otel logosu.",
      "- Hariç: QR token/görselleri, kullanıcılar, geçmiş işlemler, stok, menü ve ODA_SERVISI verisi.",
      "- Yükleme: `prisma/seed/legacyDefinitions.ts` (idempotent, var olan kaydı değiştirmez).",
      "",
      "| Otel | Kat | Oda tipi | Oda | Oda tipi-setup | Logo |",
      "|---|---|---|---|---|---|",
      ...rows,
      "",
      `Toplam: ${hotels.length} otel, ${productGroups.length} ürün grubu, ${products.length} ürün, ${setups.length} setup, ${setups.reduce((n, s) => n + s.items.length, 0)} setup içeriği.`,
      "",
    ].join("\n");
    writeFileSync(path.join(DATA_DIR, "legacy-definitions.README.md"), readme);
    console.log(readme);
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
