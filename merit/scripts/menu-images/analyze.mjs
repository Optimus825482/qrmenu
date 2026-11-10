// Menu urun gorsellerini olcer. Salt okunur: public/merit-menus ve DB'ye yazmaz.
// Kullanim: node scripts/menu-images/analyze.mjs --out <klasor> [--no-db] [--fresh]
// Cikti: <out>/metrics.json (onbellek), report.json, report.md, auto-ops.json, needs-eyes.json
import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const args = process.argv.slice(2);
const argv = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const OUT = path.resolve(argv("--out", process.env.IMG_OUT || path.join(ROOT, "tmp-img")));
const NO_DB = args.includes("--no-db");
const FRESH = args.includes("--fresh");
const DIR = path.join(ROOT, "public", "merit-menus");
const JSON_PATH = path.join(ROOT, "prisma", "seed", "data", "merit-menus.json");
fs.mkdirSync(OUT, { recursive: true });

// Arayuzdeki hedefler (guest.css / MenuView / ItemSheet):
//  kart: .g-thumb 72x72, 1:1, cover (patisserie/vienna: yuvarlak 1:1)
//  detay: .g-sheet-image / galeri: genislik 100% (<=520), yukseklik 240, cover -> 1.6:1 .. 2.17:1
//  one cikan: .g-featured-card img, genislik x 110, cover
// Esikler (veri dagilimina bakilarak secildi; rapora yazilir)
export const TH = {
  smallShort: 480,       // kisa kenar < 480 -> KUC (tumu 600x600; retina detay icin 1040 ideal, bilgi notu)
  aspectLo: 0.9,
  aspectHi: 2.0,
  blurLap: 45,           // Laplacian varyansi @512 < 45 (~alt %2.5)
  dark: 19,              // ort. parlaklik < 19 (~alt %2; 161 gorselin kosu koyu stil seti ayri not edilir)
  bright: 248,           // > 248 (~ust %1)
  lowContrast: 27,       // parlaklik std < 27 (~alt %5)
  frameMinPct: 2,        // serit >= %2
  frameHard: 0.6,        // serit siniri genisligin >=%60 inda sert kenar
  frameWhiteMin: 235,    // serit rengi bu degerin ustunde ise (beyaz zemin) cerceve sayilmaz
  frameThreshold: 12,
  // attnY (sharp attention onerisi) guvenilmez bulundu (beyaz zeminde ucuna yapisiyor): yalniz bilgi, bayrak degil
  detCut: 0.4,           // enerjinin >=%40 i orta %62.5 bandin disinda -> DKS
  subjH: 0.8,            // tek renk zeminde ozne yuksekligi > %80 -> DKS
  bigBytes: 75 * 1024,
  smallBytes: 8 * 1024,
  dupHamming: 3,
  dupColor: 2.5,
};

const norm = (s) => String(s ?? "").toLocaleLowerCase("tr").replace(/\s+/g, " ").trim();
const fileOf = (u) => (u ? decodeURIComponent(u.split("?")[0].split("/").pop()) : null);

async function measure(file) {
  const fp = path.join(DIR, file);
  const st = fs.statSync(fp);
  const buf = fs.readFileSync(fp);
  const rec = { file, bytes: st.size, mtimeMs: Math.round(st.mtimeMs), sha1: crypto.createHash("sha1").update(buf).digest("hex") };
  try {
    const meta = await sharp(buf).metadata();
    rec.width = meta.width; rec.height = meta.height; rec.format = meta.format; rec.hasAlpha = !!meta.hasAlpha;
    rec.aspect = +(meta.width / meta.height).toFixed(4);
    const flat = () => sharp(buf).flatten({ background: "#ffffff" });
    const gs = await flat().greyscale().stats();
    rec.lum = +gs.channels[0].mean.toFixed(2); rec.lumStd = +gs.channels[0].stdev.toFixed(2);
    rec.entropy = +gs.entropy.toFixed(3);
    if (rec.hasAlpha) {
      const a = await sharp(buf).ensureAlpha().extractChannel(3).stats();
      rec.alphaMin = a.channels[0].min; rec.alphaMean = +a.channels[0].mean.toFixed(1);
    }
    const g = await flat().greyscale().resize({ width: 512, withoutEnlargement: true }).raw().toBuffer({ resolveWithObject: true });
    const { data, info } = g; const w = info.width, h = info.height;
    let sum = 0, sum2 = 0, n = 0, hi = 0, lo = 0;
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      const i = y * w + x; const c = data[i];
      const v = 4 * c - data[i - 1] - data[i + 1] - data[i - w] - data[i + w];
      sum += v; sum2 += v * v; n++;
    }
    rec.lap = +(sum2 / n - (sum / n) ** 2).toFixed(2);
    for (let i = 0; i < data.length; i++) { if (data[i] >= 250) hi++; else if (data[i] <= 5) lo++; }
    rec.clipHiPct = +(100 * hi / data.length).toFixed(2); rec.clipLoPct = +(100 * lo / data.length).toFixed(2);
    const sm = await sharp(buf).resize(32, 32, { fit: "fill" }).ensureAlpha().raw().toBuffer();
    const corner = (x0, y0) => { let r = 0, gg = 0, b = 0, a = 0, c = 0; for (let y = y0; y < y0 + 4; y++) for (let x = x0; x < x0 + 4; x++) { const i = (y * 32 + x) * 4; r += sm[i]; gg += sm[i + 1]; b += sm[i + 2]; a += sm[i + 3]; c++; } return [r / c, gg / c, b / c, a / c]; };
    const cs = [corner(0, 0), corner(28, 0), corner(0, 28), corner(28, 28)];
    const avg = [0, 1, 2, 3].map((k) => cs.reduce((s, c) => s + c[k], 0) / 4);
    const spread = Math.max(...[0, 1, 2].map((k) => Math.max(...cs.map((c) => c[k])) - Math.min(...cs.map((c) => c[k]))));
    const cl = 0.2126 * avg[0] + 0.7152 * avg[1] + 0.0722 * avg[2];
    rec.cornerRGB = avg.slice(0, 3).map(Math.round); rec.cornerSpread = Math.round(spread);
    rec.bg = avg[3] < 128 ? "seffaf" : spread < 40 && cl > 240 ? "beyaz" : spread < 40 && cl < 18 ? "siyah" : "diger";
    try {
      const t = await sharp(buf).flatten({ background: "#ffffff" }).trim({ threshold: TH.frameThreshold }).toBuffer({ resolveWithObject: true });
      const L = -t.info.trimOffsetLeft, T = -t.info.trimOffsetTop;
      rec.trim = { left: L, top: T, right: rec.width - L - t.info.width, bottom: rec.height - T - t.info.height, w: t.info.width, h: t.info.height };
      rec.trimAreaPct = +(100 * (1 - (t.info.width * t.info.height) / (rec.width * rec.height))).toFixed(2);
    } catch (e) { rec.trim = null; rec.trimAreaPct = 100; rec.uniform = true; }
    // yatay satir enerjisi: detay gorselinde (yatay bant) ne kadar icerik kesiliyor
    const rowE = new Float64Array(h); let totE = 0;
    for (let y = 1; y < h - 1; y++) { let e = 0; for (let x = 1; x < w - 1; x++) { const i = y * w + x; e += Math.abs(data[i + 1] - data[i - 1]) + Math.abs(data[i + w] - data[i - w]); } rowE[y] = e; totE += e; }
    const outside = (frac) => { const lo = Math.floor(h * (1 - frac) / 2), hi = h - lo; let o = 0; for (let y = 0; y < h; y++) if (y < lo || y >= hi) o += rowE[y]; return totE ? +(o / totE).toFixed(3) : 0; };
    rec.cut60 = outside(0.625); rec.cut46 = outside(0.46);
    // sharp dikkat (attention) stratejisi: 600 genislikte 1.62:1 kesimde onerdigi dikey konum (0=ust, .5=orta, 1=alt)
    try {
      const ah = Math.round(rec.width / 1.62); const slack = rec.height - ah;
      const at = await sharp(buf).resize(rec.width, ah, { fit: "cover", position: sharp.strategy.attention }).toBuffer({ resolveWithObject: true });
      rec.attnY = slack > 0 ? +(Math.abs(at.info.cropOffsetTop ?? 0) / slack).toFixed(3) : 0.5;
    } catch (e) { rec.attnY = null; }
    // duz renkli kenar seritleri (herhangi bir renkte): 256x256 RGB
    const S = 256;
    const rgb = await flat().resize(S, S, { fit: "fill" }).raw().toBuffer();
    const px = (x, y, c) => rgb[(y * S + x) * 3 + c];
    const lineStat = (get) => { let m = [0, 0, 0], q = [0, 0, 0]; for (let i = 0; i < S; i++) for (let c = 0; c < 3; c++) { const v = get(i, c); m[c] += v; q[c] += v * v; } const mean = m.map((v) => v / S); const sd = Math.max(...q.map((v, c) => Math.sqrt(Math.max(0, v / S - mean[c] ** 2)))); return { mean, sd }; };
    // getLine(k, i, c): kenardan k. cizgideki i. pikselin c kanali
    const scan = (getPx) => {
      const L = (k) => lineStat((i, c) => getPx(k, i, c));
      const first = L(0); let n = 0;
      for (let k = 0; k < S / 2; k++) { const l = L(k); if (l.sd > 6 || Math.max(...l.mean.map((v, c) => Math.abs(v - first.mean[c]))) > 12) break; n++; }
      // serit sinirinda (n. cizgi) piksellerin ne kadari serit renginden belirgin farkli: tum genislik -> sert kenar (letterbox), kismi -> urun/arka plan
      let hard = 0; if (n > 0 && n < S / 2) { let d = 0; for (let i = 0; i < S; i++) if ([0, 1, 2].some((c) => Math.abs(getPx(n, i, c) - first.mean[c]) > 20)) d++; hard = d / S; }
      return { frac: +(n / S).toFixed(4), color: first.mean.map(Math.round), hard: +hard.toFixed(2) };
    };
    const bt = scan((k, i, c) => px(i, k, c)), bb = scan((k, i, c) => px(i, S - 1 - k, c)), bl = scan((k, i, c) => px(k, i, c)), br = scan((k, i, c) => px(S - 1 - k, i, c));
    rec.band = { t: bt.frac, b: bb.frac, l: bl.frac, r: br.frac };
    rec.bandHard = { t: bt.hard, b: bb.hard, l: bl.hard, r: br.hard };
    rec.bandColor = { t: bt.color, b: bb.color, l: bl.color, r: br.color };
    // 16x16 renkli kucuk resim + 16x17 dHash (256 bit)
    const th = await flat().resize(16, 16, { fit: "fill" }).raw().toBuffer();
    rec.thumb = th.toString("base64");
    const dh = await flat().greyscale().resize(17, 16, { fit: "fill" }).raw().toBuffer();
    const hb = Buffer.alloc(32);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if (dh[y * 17 + x] > dh[y * 17 + x + 1]) { const bi = y * 16 + x; hb[bi >> 3] |= 1 << (bi & 7); }
    rec.dhash = hb.toString("hex");
  } catch (e) { rec.broken = String(e.message || e).slice(0, 200); }
  return rec;
}
async function pool(items, size, fn) {
  const out = new Array(items.length); let i = 0;
  await Promise.all(Array.from({ length: size }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k]); } }));
  return out;
}
const PC = Array.from({ length: 256 }, (_, i) => { let c = 0, x = i; while (x) { c += x & 1; x >>= 1; } return c; });
const popcnt = (a, b) => { let c = 0; for (let i = 0; i < a.length; i++) c += PC[a[i] ^ b[i]]; return c; };
const pct = (arr, p) => { const s = [...arr].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : null; };

async function main() {
  const files = fs.readdirSync(DIR).filter((f) => /\.webp$/i.test(f)).sort();
  const otherFiles = fs.readdirSync(DIR).filter((f) => !/\.webp$/i.test(f));
  const cachePath = path.join(OUT, "metrics.json");
  const cache = !FRESH && fs.existsSync(cachePath) ? Object.fromEntries(JSON.parse(fs.readFileSync(cachePath, "utf8")).map((r) => [r.file, r])) : {};
  let done = 0;
  const metrics = await pool(files, 6, async (f) => {
    const st = fs.statSync(path.join(DIR, f)); const c = cache[f];
    if (c && c.bytes === st.size && c.mtimeMs === Math.round(st.mtimeMs) && c.thv === 5) return c;
    const r = await measure(f); r.thv = 5; if (++done % 200 === 0) console.error("olculen", done); return r;
  });
  fs.writeFileSync(cachePath, JSON.stringify(metrics));

  // ---- Kullanim: JSON ----
  const seed = JSON.parse(fs.readFileSync(JSON_PATH, "utf8"));
  const jsonUse = [];
  let jsonItems = 0;
  for (const o of seed.outlets) for (const it of o.items) {
    jsonItems++;
    jsonUse.push({ src: "json", hotel: o.hotelCode, outletName: o.outletName, roomService: !!o.isRoomService, cat: it.catPath.join(" > "), name: it.name, file: fileOf(it.imageUrl), imageUrl: it.imageUrl ?? null });
  }
  // ---- Kullanim: DB (salt okunur) ----
  let dbUse = [], dbInfo = { used: false };
  if (!NO_DB) {
    try {
      const pg = (await import("pg")).default;
      const env = fs.readFileSync(path.join(ROOT, ".env"), "utf8").match(/^DATABASE_URL=(.*)$/m)[1].replace(/^["']|["']$/g, "");
      const c = new pg.Client({ connectionString: env.split("?")[0] }); await c.connect();
      await c.query("SET default_transaction_read_only = on");
      const nodes = (await c.query("select n.id, n.parent_id, n.kind, n.name, n.image_url, n.image_urls, n.outlet_id, o.name oname, o.type otype, h.code hcode from menu_nodes n join outlets o on o.id=n.outlet_id join hotels h on h.id=o.hotel_id")).rows;
      await c.end();
      const byId = new Map(nodes.map((n) => [n.id, n]));
      const pathOf = (n) => { const p = []; let cur = byId.get(n.parent_id); while (cur) { p.unshift(cur.name); cur = byId.get(cur.parent_id); } return p.join(" > "); };
      for (const n of nodes) if (n.kind === "OGE") {
        const urls = [...new Set([n.image_url, ...(n.image_urls || [])].filter(Boolean))];
        dbUse.push({ src: "db", hotel: n.hcode, outletName: n.oname, roomService: n.otype === "ODA_SERVISI", cat: pathOf(n), name: n.name, file: fileOf(n.image_url), imageUrl: n.image_url ?? null, galleryFiles: urls.map(fileOf) });
      }
      dbInfo = { used: true, oge: dbUse.length, withImage: dbUse.filter((x) => x.imageUrl).length, withGalleryExtra: dbUse.filter((x) => x.galleryFiles.some((f) => f !== x.file)).length };
    } catch (e) { dbInfo = { used: false, error: String(e.message || e) }; }
  }
  const rsName = {}; for (const d of dbUse) if (d.roomService) rsName[d.hotel] = d.outletName;
  for (const j of jsonUse) j.outlet = j.outletName ?? rsName[j.hotel] ?? `${j.hotel} Oda Servisi`;
  for (const d of dbUse) d.outlet = d.outletName;
  const key = (x) => [x.hotel, x.outlet, x.cat, x.name].join("|");
  const group = (arr) => { const m = new Map(); for (const x of arr) { const k = key(x); (m.get(k) ?? m.set(k, []).get(k)).push(x.file ?? ""); } return m; };
  const gj = group(jsonUse), gd = group(dbUse);
  const mismatch = { onlyJson: [], onlyDb: [], imageDiffers: [] };
  if (dbInfo.used) {
    for (const [k, v] of gj) { if (!gd.has(k)) mismatch.onlyJson.push(k); else if (v.slice().sort().join() !== gd.get(k).slice().sort().join()) mismatch.imageDiffers.push({ key: k, json: v, db: gd.get(k) }); }
    for (const k of gd.keys()) if (!gj.has(k)) mismatch.onlyDb.push(k);
  }
  const useList = dbInfo.used ? dbUse : jsonUse;
  const usage = {};
  const addUse = (file, u) => { if (!file) return; (usage[file] ??= []).push(u); };
  for (const u of useList) for (const f of new Set(u.galleryFiles ?? [u.file])) addUse(f, { hotel: u.hotel, outlet: u.outlet, cat: u.cat, name: u.name, primary: f === u.file });
  const jsonFiles = new Set(jsonUse.map((x) => x.file).filter(Boolean));
  const dbFiles = new Set(dbUse.flatMap((x) => x.galleryFiles ?? []).filter(Boolean));
  const usedSet = new Set(Object.keys(usage));
  const onDisk = new Set(files);
  const orphans = files.filter((f) => !usedSet.has(f));
  const missing = [...usedSet].filter((f) => !onDisk.has(f));
  const orphansVsJson = files.filter((f) => !jsonFiles.has(f));
  const noImage = useList.filter((x) => !x.file).map((x) => ({ hotel: x.hotel, outlet: x.outlet, cat: x.cat, name: x.name }));
  const noImageJson = jsonUse.filter((x) => !x.file).length;

  // ---- Kopya / cok benzer ----
  const ok = metrics.filter((m) => !m.broken);
  const exactMap = new Map(); for (const m of ok) (exactMap.get(m.sha1) ?? exactMap.set(m.sha1, []).get(m.sha1)).push(m.file);
  const exactGroups = [...exactMap.values()].filter((g) => g.length > 1);
  const parent = new Map(ok.map((m) => [m.file, m.file]));
  const find = (x) => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); } return x; };
  const nearPairs = [];
  const HB = ok.map((m) => Buffer.from(m.dhash, "hex")), TB = ok.map((m) => Buffer.from(m.thumb, "base64"));
  for (let i = 0; i < ok.length; i++) for (let j = i + 1; j < ok.length; j++) {
    if (ok[i].sha1 === ok[j].sha1) { parent.set(find(ok[i].file), find(ok[j].file)); continue; }
    const d = popcnt(HB[i], HB[j]);
    if (d > TH.dupHamming) continue;
    let cd = 0; for (let k = 0; k < 768; k++) cd += Math.abs(TB[i][k] - TB[j][k]); cd /= 768;
    if (cd <= TH.dupColor) { nearPairs.push([ok[i].file, ok[j].file, d]); parent.set(find(ok[i].file), find(ok[j].file)); }
  }
  const clusters = new Map(); for (const m of ok) (clusters.get(find(m.file)) ?? clusters.set(find(m.file), []).get(find(m.file))).push(m.file);
  const dupGroups = [...clusters.values()].filter((g) => g.length > 1);
  const dupOf = {}; dupGroups.forEach((g, gi) => g.forEach((f) => { dupOf[f] = gi; }));
  const exactOf = new Set(exactGroups.flat());

  // ---- Farkli adli urunler ayni gorseli paylasiyor ----
  const nameShare = [];
  for (const [f, us] of Object.entries(usage)) {
    const prim = us.filter((u) => u.primary);
    const names = [...new Set(prim.map((u) => norm(u.name)))];
    if (names.length > 1) {
      const so = {}; for (const u of prim) (so[u.hotel + "|" + u.outlet] ??= new Set()).add(norm(u.name));
      const within = Object.entries(so).filter(([, s]) => s.size > 1).map(([o, s]) => ({ outlet: o, names: [...s] }));
      nameShare.push({ file: f, names: names.length, withinOutlet: within, uses: prim.map((u) => `${u.outlet} / ${u.cat} / ${u.name}`) });
    }
  }
  const nameShareWithin = new Set(nameShare.filter((n) => n.withinOutlet.length).map((n) => n.file));
  const nearDiffName = nearPairs.filter(([a, b]) => {
    const na = new Set((usage[a] ?? []).map((u) => norm(u.name))), nb = new Set((usage[b] ?? []).map((u) => norm(u.name)));
    return na.size && nb.size && ![...na].some((x) => nb.has(x));
  });

  // ---- Bayraklar ----
  const frameSides = (m) => {
    if (m.broken || !m.band) return [];
    const sd = ["t", "b", "l", "r"].filter((k) => m.band[k] * 100 >= TH.frameMinPct && m.bandHard[k] >= TH.frameHard && Math.min(...m.bandColor[k]) < TH.frameWhiteMin);
    return sd.length >= 1 && sd.length <= 3 ? sd : [];
  };
  const flagsOf = (m) => {
    const f = [];
    if (m.broken) return ["BZK"];
    if (Math.min(m.width, m.height) < TH.smallShort) f.push("KUC");
    if (m.aspect < TH.aspectLo || m.aspect > TH.aspectHi) f.push("ORN");
    if (m.lap < TH.blurLap) f.push("BLR");
    if (m.lum < TH.dark) f.push("KRN");
    if (m.lum > TH.bright) f.push("ACK");
    if (m.lumStd < TH.lowContrast) f.push("DKN");
    if (frameSides(m).length) f.push("CRC");
    if (m.cut60 >= TH.detCut || (m.bg === "beyaz" && m.trim && m.trim.h / m.height > TH.subjH)) f.push("DKS");
    if (m.bytes > TH.bigBytes) f.push("BYK");
    if (m.bytes < TH.smallBytes) f.push("KCK");
    if (m.hasAlpha && m.alphaMin < 250) f.push("ALF");
    if (m.file in dupOf) f.push(exactOf.has(m.file) ? "KPY" : "BNZ");
    return f;
  };
  const FLAG_DESC = {
    BZK: "bozuk/okunamayan", KUC: `kucuk cozunurluk (kisa kenar < ${TH.smallShort}px)`, ORN: `asiri oran (en/boy < ${TH.aspectLo} veya > ${TH.aspectHi})`,
    BLR: `bulanik (Laplacian var. < ${TH.blurLap} @512px)`, KRN: `cok karanlik (ort. parlaklik < ${TH.dark})`, ACK: `cok acik (ort. parlaklik > ${TH.bright})`,
    DKN: `dusuk kontrast (parlaklik std < ${TH.lowContrast})`, CRC: `cerceve/letterbox (beyaz olmayan duz serit >= %${TH.frameMinPct}, sinir genisligin >= %${TH.frameHard * 100}, 1-3 kenar)`, DKS: `detay (240px yatay bant ~1.6-2.2:1) kirpmasinda icerik kesilir (kenar enerjisinin >= %${TH.detCut * 100} orta %62.5 disinda ya da tek renk zeminde ozne yuksekligi > %${TH.subjH * 100})`,
    BYK: `buyuk dosya (> ${TH.bigBytes / 1024} KB)`, KCK: `kucuk dosya (< ${TH.smallBytes / 1024} KB)`, ALF: "gercek seffaflik (alfa<250)",
    KPY: "birebir kopya (sha1)", BNZ: `cok benzer (dHash256 <= ${TH.dupHamming} bit ve renk farki <= ${TH.dupColor})`, AYG: "ayni outlet icinde farkli adli urunler ayni gorseli kullaniyor", YTM: "yetim (kullanilmiyor)",
  };
  const perFile = {};
  for (const m of metrics) {
    const fl = flagsOf(m); if (nameShareWithin.has(m.file)) fl.push("AYG");
    if (!usedSet.has(m.file)) fl.push("YTM");
    const us = usage[m.file] ?? [];
    perFile[m.file] = { ...m, flags: fl, uses: us.length, outlets: [...new Set(us.map((u) => u.hotel + " / " + u.outlet))], products: us.map((u) => ({ outlet: u.outlet, hotel: u.hotel, cat: u.cat, name: u.name })), dupGroup: m.file in dupOf ? dupOf[m.file] : null };
  }
  const flagCount = {}; for (const p of Object.values(perFile)) for (const f of p.flags) flagCount[f] = (flagCount[f] ?? 0) + 1;

  // ---- Dagilim ----
  const aspBuckets = { "<0.75": 0, "0.75-0.9": 0, "0.9-1.1 (kare)": 0, "1.1-1.4": 0, "1.4-1.7": 0, "1.7-2.0": 0, ">2.0": 0 };
  for (const m of ok) { const a = m.aspect; aspBuckets[a < 0.75 ? "<0.75" : a < 0.9 ? "0.75-0.9" : a < 1.1 ? "0.9-1.1 (kare)" : a < 1.4 ? "1.1-1.4" : a < 1.7 ? "1.4-1.7" : a < 2.0 ? "1.7-2.0" : ">2.0"]++; }
  const sizeCount = {}; for (const m of ok) { const k = m.width + "x" + m.height; sizeCount[k] = (sizeCount[k] ?? 0) + 1; }
  const topSizes = Object.entries(sizeCount).sort((a, b) => b[1] - a[1]).slice(0, 12);
  const stat = (k) => ({ min: Math.min(...ok.map((m) => m[k])), p05: pct(ok.map((m) => m[k]), 0.05), p25: pct(ok.map((m) => m[k]), 0.25), p50: pct(ok.map((m) => m[k]), 0.5), p75: pct(ok.map((m) => m[k]), 0.75), p95: pct(ok.map((m) => m[k]), 0.95), max: Math.max(...ok.map((m) => m[k])) });
  const dist = { width: stat("width"), height: stat("height"), aspect: stat("aspect"), bytes: stat("bytes"), lum: stat("lum"), lumStd: stat("lumStd"), lap: stat("lap"), trimAreaPct: stat("trimAreaPct") };
  const totalBytes = metrics.reduce((s, m) => s + m.bytes, 0);
  const bgCount = {}; for (const m of ok) bgCount[m.bg] = (bgCount[m.bg] ?? 0) + 1;

  // ---- Oneriler ----
  const autoOps = [], needsEyes = [];
  for (const m of metrics) {
    const p = perFile[m.file];
    if (m.broken) { needsEyes.push({ file: m.file, flags: ["BZK"], reason: ["bozuk: " + m.broken] }); continue; }
    if (p.flags.includes("YTM")) continue; // yetimler ayrica listelenir
    const ops = []; const reasons = [];
    const t = m.trim;
    if (p.flags.includes("CRC")) {
      const sd = frameSides(m); const W = m.width, H = m.height;
      const px = { l: sd.includes("l") ? Math.ceil(m.band.l * W) + 1 : 0, r: sd.includes("r") ? Math.ceil(m.band.r * W) + 1 : 0, t: sd.includes("t") ? Math.ceil(m.band.t * H) + 1 : 0, b: sd.includes("b") ? Math.ceil(m.band.b * H) + 1 : 0 };
      const cw = W - px.l - px.r, ch = H - px.t - px.b; const loss = 100 * (1 - (cw * ch) / (W * H));
      const mx = Math.max(...sd.map((k) => m.band[k])) * 100;
      if (mx <= 15 && loss <= 25 && cw >= TH.smallShort && ch >= TH.smallShort) ops.push({ op: "crop", box: { left: px.l, top: px.t, width: cw, height: ch }, note: "serit: " + sd.join("") });
      else reasons.push(`cerceve serit ${sd.join("")}: maks %${mx.toFixed(1)}, alan kaybi %${loss.toFixed(1)}`);
    }
    if (p.flags.includes("BYK") && !p.flags.includes("KUC")) {
      if (Math.max(m.width, m.height) > 1400) ops.push({ op: "resizeMax", max: 1200 });
      ops.push({ op: "recompress", quality: 80 });
    }
    if (ops.length) autoOps.push({ file: m.file, ops, why: p.flags.filter((f) => f === "CRC" || f === "BYK"), before: { w: m.width, h: m.height, bytes: m.bytes } });
    const eyes = p.flags.filter((f) => ["KUC", "ORN", "BLR", "KRN", "ACK", "DKN", "ALF", "BNZ", "AYG", "KCK", "DKS"].includes(f));
    if (eyes.length || reasons.length) needsEyes.push({ file: m.file, priority: eyes.some((f) => f !== "DKS") || reasons.length ? "yuksek" : "dusuk (yalniz DKS: detay kirpma, cogunlukla CSS/odak meselesi)", flags: eyes, reason: reasons, uses: p.uses, products: p.products.slice(0, 3).map((x) => x.name) });
  }

  needsEyes.sort((a, b) => (a.priority[0] === "y" ? 0 : 1) - (b.priority[0] === "y" ? 0 : 1));
  const report = {
    generatedAt: new Date().toISOString(),
    targets: { card: "72x72 css px, 1:1, object-fit:cover (patisserie/vienna: yuvarlak 1:1)", sheet: "genislik 100% (<=520px), yukseklik 240px, cover -> 1.6:1 (390px ekran) .. 2.17:1 (520px)", featured: "genislik x 110px, cover (img niteligi 320x180 16:9, gercek kutu daha yatay)" },
    thresholds: TH, flagDescriptions: FLAG_DESC,
    counts: { files: files.length, nonWebpFiles: otherFiles, totalBytes, used: files.length - orphans.length, orphans: orphans.length, referencedMissing: missing.length, productsNoImage: noImage.length, productsNoImageInJson: noImageJson, broken: metrics.filter((m) => m.broken).length, jsonItems, dbInfo, exactDupGroups: exactGroups.length, exactDupFiles: exactGroups.flat().length, nearPairs: nearPairs.length, dupGroupsAll: dupGroups.length, dupFilesAll: dupGroups.flat().length, filesWithDifferentNamedProducts: nameShare.length, filesWithDifferentNamesWithinSameOutlet: nameShareWithin.size, nearPairsDiffName: nearDiffName.length, orphansVsJsonOnly: orphansVsJson.length },
    jsonVsDb: { onlyJson: mismatch.onlyJson.length, onlyDb: mismatch.onlyDb.length, imageDiffers: mismatch.imageDiffers.length, samples: { onlyJson: mismatch.onlyJson.slice(0, 10), onlyDb: mismatch.onlyDb.slice(0, 10), imageDiffers: mismatch.imageDiffers.slice(0, 10) }, filesDbNotJson: [...dbFiles].filter((f) => !jsonFiles.has(f)).length, filesJsonNotDb: [...jsonFiles].filter((f) => !dbFiles.has(f)).length },
    distributions: dist, aspectBuckets: aspBuckets, topSizes, backgrounds: bgCount, flagCount,
    autoOps: { files: autoOps.length, crop: autoOps.filter((a) => a.ops.some((o) => o.op === "crop")).length, recompress: autoOps.filter((a) => a.ops.some((o) => o.op === "recompress")).length, resize: autoOps.filter((a) => a.ops.some((o) => o.op === "resizeMax")).length },
    needsEyes: needsEyes.length,
    orphans, missing, noImage: noImage.slice(0, 200), exactGroups, nearPairs, nameShare, perFile,
    dupGroups: dupGroups.map((g) => g.map((f) => ({ file: f, products: (usage[f] ?? []).slice(0, 2).map((u) => u.name) }))),
  };
  fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 1));
  fs.writeFileSync(path.join(OUT, "auto-ops.json"), JSON.stringify({ note: "Guvenle otomatik uygulanabilir islemler (apply.mjs formati). UYGULANMADI.", ops: autoOps.flatMap((a) => a.ops.map((o) => ({ file: a.file, ...o }))), detail: autoOps }, null, 1));
  fs.writeFileSync(path.join(OUT, "needs-eyes.json"), JSON.stringify(needsEyes, null, 1));
  const md = [
    "# Menu gorselleri olcum raporu", "", `Uretim: ${report.generatedAt}`, "", "## Sayilar",
    `- Diskte .webp: **${files.length}** (${(totalBytes / 1048576).toFixed(1)} MB); diger dosyalar: ${otherFiles.length}`,
    `- Kullanim kaynagi: ${dbInfo.used ? "DB (menu_nodes) + JSON karsilastirmasi" : "yalniz JSON (" + (dbInfo.error ?? "DB kapali") + ")"}`,
    `- Kullanilan: **${files.length - orphans.length}**, yetim: **${orphans.length}**, atif var diskte yok: **${missing.length}**, gorseli olmayan urun: **${noImage.length}** (JSON: ${noImageJson}), bozuk: ${report.counts.broken}`,
    `- JSON urun: ${jsonItems}; DB OGE: ${dbInfo.oge ?? "-"} (gorselli ${dbInfo.withImage ?? "-"}; galeride farkli ek gorsel: ${dbInfo.withGalleryExtra ?? "-"})`,
    `- JSON vs DB (outlet|kategori|ad anahtari): yalniz JSON ${mismatch.onlyJson.length}, yalniz DB ${mismatch.onlyDb.length}, gorsel farkli ${mismatch.imageDiffers.length}; dosya: JSON'da olup DB'de olmayan ${report.jsonVsDb.filesJsonNotDb}, DB'de olup JSON'da olmayan ${report.jsonVsDb.filesDbNotJson}; JSON'a gore yetim ${orphansVsJson.length}`,
    `- Birebir kopya: ${exactGroups.length} grup / ${exactGroups.flat().length} dosya; cok benzer (dHash256<=${TH.dupHamming} bit, renk<=${TH.dupColor}) cift: ${nearPairs.length}; tum kumeler: ${dupGroups.length} grup / ${dupGroups.flat().length} dosya; benzer ama farkli adli cift: ${nearDiffName.length}`,
    `- Birden cok FARKLI adli urunun paylastigi dosya: ${nameShare.length} (ayni outlet icinde: ${nameShareWithin.size})`, "",
    "## Hedef (arayuz)", ...Object.entries(report.targets).map(([k, v]) => `- ${k}: ${v}`), "",
    "## Dagilimlar", "| olcu | min | p05 | p25 | p50 | p75 | p95 | max |", "|---|---|---|---|---|---|---|---|",
    ...Object.entries(dist).map(([k, s]) => `| ${k} | ${s.min} | ${s.p05} | ${s.p25} | ${s.p50} | ${s.p75} | ${s.p95} | ${s.max} |`), "",
    `En-boy: ${JSON.stringify(aspBuckets)}`, "", `En sik boyutlar: ${topSizes.map(([k, v]) => k + " x" + v).join(", ")}`, "", `Zemin: ${JSON.stringify(bgCount)}`, "",
    "## Esikler ve bayraklar", "| bayrak | aciklama | adet |", "|---|---|---|", ...Object.entries(FLAG_DESC).map(([k, v]) => `| ${k} | ${v} | ${flagCount[k] ?? 0} |`), "",
    "## Oneriler", `- auto-ops.json: ${autoOps.length} dosya (crop ${report.autoOps.crop}, recompress ${report.autoOps.recompress}, resizeMax ${report.autoOps.resize})`, `- needs-eyes.json: ${needsEyes.length} dosya`, "",
    "## JSON-DB tutarsizlik ornekleri", "```json", JSON.stringify(report.jsonVsDb.samples, null, 1).slice(0, 3000), "```", "",
  ].join("\n");
  fs.writeFileSync(path.join(OUT, "report.md"), md);
  console.log(md);
}
main().catch((e) => { console.error(e); process.exit(1); });
