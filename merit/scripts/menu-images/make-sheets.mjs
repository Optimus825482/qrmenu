// Gozle inceleme foyleri (6x5 kucuk resim izgarasi, JPEG) uretir. public/merit-menus'a yazmaz.
// Kullanim: node scripts/menu-images/make-sheets.mjs --out <klasor> [--no-band] [--cell 220]
// Girdi: <out>/report.json (analyze.mjs). Cikti: <out>/sheets/<outlet-slug>-NN.jpg + .json, orphans-NN.jpg, index.json
import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const args = process.argv.slice(2);
const argv = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const OUT = path.resolve(argv("--out", process.env.IMG_OUT || path.join(ROOT, "tmp-img")));
const CELL = Number(argv("--cell", 220));
const BAND = !args.includes("--no-band");
const COLS = 6, ROWS = 5, PER = COLS * ROWS, GAP = 6, LABEL = 42, HEAD = 26;
const DIR = path.join(ROOT, "public", "merit-menus");
const SHEETS = path.join(OUT, "sheets");
fs.mkdirSync(SHEETS, { recursive: true });
for (const f of fs.readdirSync(SHEETS)) if (/\.(jpg|json)$/.test(f)) fs.unlinkSync(path.join(SHEETS, f));

const report = JSON.parse(fs.readFileSync(path.join(OUT, "report.json"), "utf8"));
const seed = JSON.parse(fs.readFileSync(path.join(ROOT, "prisma", "seed", "data", "merit-menus.json"), "utf8"));
const perFile = report.perFile;

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const trunc = (s, n) => (s.length > n ? s.slice(0, n - 1) + "…" : s);
const slugify = (s) => s.toLocaleLowerCase("tr").replace(/ı/g, "i").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const FONT = "Segoe UI, Arial, DejaVu Sans, Liberation Sans, sans-serif";

// outlet sirasi: seed sirasi (null ad -> oda servisi); isim DB adlariyla eslenir
const rsNames = {};
for (const p of Object.values(perFile)) for (const u of p.products) if (/Oda Servisi/i.test(u.outlet)) rsNames[u.hotel] = u.outlet;
const outletOrder = [];
for (const o of seed.outlets) { const name = o.outletName ?? rsNames[o.hotelCode]; const k = o.hotelCode + "|" + name; if (!outletOrder.includes(k)) outletOrder.push(k); }
const outletKeyOf = (u) => u.hotel + "|" + u.outlet;

// Her gorsel yalniz ILK outlet'in foyunde
const byOutlet = new Map(outletOrder.map((k) => [k, []]));
const used = Object.values(perFile).filter((p) => p.uses > 0);
for (const p of used) {
  const keys = p.products.map(outletKeyOf);
  const first = outletOrder.find((k) => keys.includes(k)) ?? keys[0];
  if (!byOutlet.has(first)) byOutlet.set(first, []);
  byOutlet.get(first).push(p);
}
const orphanList = Object.values(perFile).filter((p) => p.uses === 0).sort((a, b) => a.file.localeCompare(b.file));

async function cellSvgAndImage(entry, n) {
  const p = entry.p;
  const img = await sharp(path.join(DIR, p.file)).flatten({ background: "#ffffff" }).resize(CELL, CELL, { fit: "contain", background: "#ffffff" }).jpeg({ quality: 88 }).toBuffer();
  return img;
}

async function renderSheet(title, entries, outJpg) {
  const W = COLS * (CELL + GAP) + GAP, H = HEAD + ROWS * (CELL + LABEL + GAP) + GAP;
  const comps = []; const svgParts = [];
  svgParts.push(`<text x="${GAP}" y="18" font-family="${FONT}" font-size="15" font-weight="700" fill="#111">${esc(title)}</text>`);
  svgParts.push(`<text x="${W - GAP}" y="18" font-family="${FONT}" font-size="11" text-anchor="end" fill="#555">${BAND ? "kirmizi cizgiler: detay gorselinde gorunen orta bant (%62.5)" : ""}</text>`);
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i]; const p = e.p;
    const col = i % COLS, row = Math.floor(i / COLS);
    const x = GAP + col * (CELL + GAP), y = HEAD + GAP + row * (CELL + LABEL + GAP);
    comps.push({ input: await cellSvgAndImage(e, i), left: x, top: y });
    const flags = p.flags.join(" ");
    const num = String(i + 1).padStart(2, "0");
    const nm = e.names.length ? trunc(e.names[0], 30) + (e.names.length > 1 ? ` (+${e.names.length - 1})` : "") : "(kullanilmiyor) " + p.file.slice(0, 8);
    svgParts.push(`<rect x="${x - 0.5}" y="${y - 0.5}" width="${CELL + 1}" height="${CELL + 1}" fill="none" stroke="#bbb" stroke-width="1"/>`);
    if (BAND) {
      const t = y + CELL * 0.1875, b = y + CELL * 0.8125;
      svgParts.push(`<line x1="${x}" y1="${t}" x2="${x + CELL}" y2="${t}" stroke="#e11" stroke-opacity=".55" stroke-width="1" stroke-dasharray="4 3"/>`);
      svgParts.push(`<line x1="${x}" y1="${b}" x2="${x + CELL}" y2="${b}" stroke="#e11" stroke-opacity=".55" stroke-width="1" stroke-dasharray="4 3"/>`);
    }
    // numara etiketi (resmin sol ustunde)
    svgParts.push(`<rect x="${x}" y="${y}" width="30" height="18" fill="#000" fill-opacity=".75"/><text x="${x + 15}" y="${y + 13}" font-family="${FONT}" font-size="13" font-weight="700" fill="#fff" text-anchor="middle">${num}</text>`);
    const ly = y + CELL;
    svgParts.push(`<text x="${x + 1}" y="${ly + 16}" font-family="${FONT}" font-size="12" font-weight="700" fill="${flags ? "#b00020" : "#2e7d32"}">${esc(num)} ${esc(trunc(flags || "ok", 30))}</text>`);
    svgParts.push(`<text x="${x + 1}" y="${ly + 34}" font-family="${FONT}" font-size="13" fill="#111">${esc(nm)}</text>`);
  }
  comps.push({ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${svgParts.join("")}</svg>`), left: 0, top: 0 });
  await sharp({ create: { width: W, height: H, channels: 3, background: "#ffffff" } }).composite(comps).jpeg({ quality: 85 }).toFile(outJpg);
  return { W, H };
}

const index = { generatedAt: new Date().toISOString(), grid: `${COLS}x${ROWS}`, cell: CELL, bandOverlay: BAND, note: "Bir gorsel birden cok outlet'te kullaniliyorsa yalniz ilk outlet foyunde gosterilir.", outlets: [], orphans: null, totals: { sheets: 0, imagesShown: 0 } };
const slugs = new Set();
let shown = 0;
for (const key of byOutlet.keys()) {
  const list = byOutlet.get(key); if (!list.length) continue;
  const [hotel, outlet] = key.split("|");
  let slug = slugify(outlet).startsWith(slugify(hotel)) ? slugify(outlet) : slugify(hotel) + "-" + slugify(outlet);
  while (slugs.has(slug)) slug += "x"; slugs.add(slug);
  const entries = list.map((p) => {
    const mine = p.products.filter((u) => outletKeyOf(u) === key);
    return { p, names: [...new Set(mine.map((u) => u.name))], cats: [...new Set(mine.map((u) => u.cat))], mine };
  }).sort((a, b) => (a.cats[0] ?? "").localeCompare(b.cats[0] ?? "", "tr") || (a.names[0] ?? "").localeCompare(b.names[0] ?? "", "tr"));
  const sheets = [];
  const nSheets = Math.ceil(entries.length / PER);
  for (let s = 0; s < nSheets; s++) {
    const chunk = entries.slice(s * PER, (s + 1) * PER); const nn = String(s + 1).padStart(2, "0");
    const base = `${slug}-${nn}`;
    await renderSheet(`${hotel} / ${outlet}  -  foy ${s + 1}/${nSheets}  (${chunk.length} gorsel)`, chunk, path.join(SHEETS, base + ".jpg"));
    fs.writeFileSync(path.join(SHEETS, base + ".json"), JSON.stringify({ sheet: base + ".jpg", hotel, outlet, sheetNo: s + 1, sheets: nSheets, cells: chunk.map((e, i) => ({ n: i + 1, file: e.p.file, name: e.names[0] ?? null, allNamesInOutlet: e.names, category: e.cats[0] ?? null, flags: e.p.flags, usedInOutlets: e.p.outlets.length, aspect: e.p.aspect, size: `${e.p.width}x${e.p.height}`, bytes: e.p.bytes, cut60: e.p.cut60 })) }, null, 1));
    sheets.push({ jpg: `sheets/${base}.jpg`, json: `sheets/${base}.json`, count: chunk.length });
    shown += chunk.length;
  }
  index.outlets.push({ slug, hotel, outlet, images: entries.length, sheets });
  console.log(slug, entries.length, nSheets);
}
// yetimler
const orph = [];
for (let s = 0; s * PER < orphanList.length; s++) {
  const chunk = orphanList.slice(s * PER, (s + 1) * PER).map((p) => ({ p, names: [], cats: [] })); const nn = String(s + 1).padStart(2, "0");
  await renderSheet(`YETIM gorseller - foy ${s + 1} (${chunk.length})`, chunk, path.join(SHEETS, `orphans-${nn}.jpg`));
  fs.writeFileSync(path.join(SHEETS, `orphans-${nn}.json`), JSON.stringify({ sheet: `orphans-${nn}.jpg`, cells: chunk.map((e, i) => ({ n: i + 1, file: e.p.file, flags: e.p.flags, size: `${e.p.width}x${e.p.height}`, bytes: e.p.bytes })) }, null, 1));
  orph.push({ jpg: `sheets/orphans-${nn}.jpg`, json: `sheets/orphans-${nn}.json`, count: chunk.length }); shown += chunk.length;
}
index.orphans = { images: orphanList.length, sheets: orph };
index.totals = { sheets: index.outlets.reduce((a, o) => a + o.sheets.length, 0) + orph.length, imagesShown: shown, outletSheetImages: index.outlets.reduce((a, o) => a + o.images, 0), orphanImages: orphanList.length };
fs.writeFileSync(path.join(SHEETS, "index.json"), JSON.stringify(index, null, 1));
console.log(JSON.stringify(index.totals));
