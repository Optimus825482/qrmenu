// Gorsel duzeltme araci: bir islem listesi JSON'unu public/merit-menus (ya da --dir) uzerinde uygular.
// Her zaman ayni dosya adina .webp yazar (URL degismez). Degistirmeden once orijinali yedek klasorune kopyalar
// (zaten yedegi varsa ilk yedegin uzerine yazmaz). Kucuk gorseli buyutmez (upscale yok).
//
// Kullanim:
//   node scripts/menu-images/apply.mjs <ops.json> [--dry-run] [--dir <gorsel klasoru>] [--backup <yedek klasoru>] [--quality 80] [--only <dosya>]
//
// ops.json: [ {file, op, ...parametreler}, ... ]  veya  { ops: [...] }. Ayni dosya icin birden cok kayit
// dosyadaki sirayla uygulanir. Islemler:
//   trim        {threshold?:12}                         duz renkli cerceveyi kirpar (sharp trim)
//   crop        {box:{left,top,width,height}}  px  |  {pct:{left,top,width,height}} (0-100 yuzde)
//   cover       {ratio:"4:3" | ratio:1.333, focus:"attention"|"entropy"|"centre"|{x,y}}  (x,y 0..1; hedef oranda en buyuk kesit, boyut korunur)
//   rotate      {angle:90|180|270|derece, background?:"#fff"}
//   brighten    {value:1.1}      (carpan; modulate brightness)
//   gamma       {value:1.2}      (1.0-3.0)
//   saturate    {value:1.15}     (carpan; modulate saturation)
//   sharpen     {sigma?:0.8}
//   normalize   {lower?:1, upper?:99}
//   resizeMax   {max:1200}       (uzun kenar > max ise kucultur; asla buyutmez)
//   recompress  {quality:80}     (yalniz yeniden kodlama)
import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const args = process.argv.slice(2);
const flag = (k) => args.includes(k);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const opsFile = args[0] && !args[0].startsWith("--") ? args[0] : null;
if (!opsFile) { console.error("Kullanim: node scripts/menu-images/apply.mjs <ops.json> [--dry-run] [--dir <klasor>] [--backup <klasor>] [--quality 80] [--only <dosya>]"); process.exit(2); }
const DRY = flag("--dry-run");
const DIR = path.resolve(opt("--dir", path.join(ROOT, "public", "merit-menus")));
const BACKUP = path.resolve(opt("--backup", path.join(process.env.IMG_OUT || path.join(ROOT, "tmp-img"), "backup")));
const QUALITY = Number(opt("--quality", 80));
const ONLY = opt("--only", null);

const raw = JSON.parse(fs.readFileSync(path.resolve(opsFile), "utf8"));
const list = Array.isArray(raw) ? raw : raw.ops;
if (!Array.isArray(list)) { console.error("ops.json bir dizi ya da {ops:[...]} olmali"); process.exit(2); }
const byFile = new Map();
for (const o of list) { if (!o.file || !o.op) { console.error("Gecersiz kayit:", JSON.stringify(o)); process.exit(2); } if (ONLY && o.file !== ONLY) continue; (byFile.get(o.file) ?? byFile.set(o.file, []).get(o.file)).push(o); }

const parseRatio = (r) => { if (typeof r === "number") return r; const m = String(r).split(/[:x/]/).map(Number); return m.length === 2 ? m[0] / m[1] : Number(r); };

// Tek bir islemi uygular; ara sonuc kayipsiz PNG tamponudur.
async function applyOp(buf, o, state) {
  const meta = await sharp(buf).metadata(); const W = meta.width, H = meta.height;
  const out = (img) => img.png({ compressionLevel: 1 }).toBuffer();
  switch (o.op) {
    case "trim": return out(sharp(buf).trim({ threshold: o.threshold ?? 12 }));
    case "crop": {
      let b = o.box;
      if (!b && o.pct) b = { left: Math.round(W * o.pct.left / 100), top: Math.round(H * o.pct.top / 100), width: Math.round(W * o.pct.width / 100), height: Math.round(H * o.pct.height / 100) };
      if (!b) throw new Error("crop: box ya da pct gerekli");
      const left = Math.max(0, Math.min(W - 1, Math.round(b.left))), top = Math.max(0, Math.min(H - 1, Math.round(b.top)));
      const width = Math.max(1, Math.min(W - left, Math.round(b.width))), height = Math.max(1, Math.min(H - top, Math.round(b.height)));
      return out(sharp(buf).extract({ left, top, width, height }));
    }
    case "cover": {
      const R = parseRatio(o.ratio); if (!(R > 0)) throw new Error("cover: gecerli ratio gerekli");
      // hedef orandaki en buyuk kesit (boyut korunur, buyutme yok)
      let cw = W, ch = H; if (W / H > R) cw = Math.round(H * R); else ch = Math.round(W / R);
      const f = o.focus ?? "attention";
      if (typeof f === "object") {
        const fx = f.x > 1 ? f.x / W : f.x, fy = f.y > 1 ? f.y / H : f.y;
        const left = Math.max(0, Math.min(W - cw, Math.round(fx * W - cw / 2))), top = Math.max(0, Math.min(H - ch, Math.round(fy * H - ch / 2)));
        return out(sharp(buf).extract({ left, top, width: cw, height: ch }));
      }
      const pos = f === "attention" ? sharp.strategy.attention : f === "entropy" ? sharp.strategy.entropy : "centre";
      // kesit boyutu bir kenarda kaynakla ayni oldugundan resize olcek degistirmez, yalniz kirpar
      return out(sharp(buf).resize(cw, ch, { fit: "cover", position: pos }));
    }
    case "rotate": return out(sharp(buf).rotate(o.angle, { background: o.background ?? "#ffffff" }));
    case "brighten": return out(sharp(buf).modulate({ brightness: o.value ?? 1.1 }));
    case "gamma": return out(sharp(buf).gamma(o.value ?? 1.2));
    case "saturate": return out(sharp(buf).modulate({ saturation: o.value ?? 1.15 }));
    case "sharpen": return out(sharp(buf).sharpen({ sigma: o.sigma ?? 0.8 }));
    case "normalize": return out(sharp(buf).normalise({ lower: o.lower ?? 1, upper: o.upper ?? 99 }));
    case "resizeMax": {
      const max = o.max; if (!(max > 0)) throw new Error("resizeMax: max gerekli");
      if (Math.max(W, H) <= max) { state.notes.push("resizeMax: zaten <= " + max + ", atlandi"); return buf; }
      return out(sharp(buf).resize({ width: W >= H ? max : undefined, height: H > W ? max : undefined, withoutEnlargement: true }));
    }
    case "recompress": state.quality = o.quality ?? QUALITY; return buf;
    default: throw new Error("bilinmeyen islem: " + o.op);
  }
}

const rows = []; let errors = 0, changed = 0;
if (!DRY) fs.mkdirSync(BACKUP, { recursive: true });
for (const [file, ops] of byFile) {
  const fp = path.join(DIR, file);
  const row = { file, ops: ops.map((o) => o.op).join("+") };
  try {
    if (!/\.webp$/i.test(file)) throw new Error("yalniz .webp dosyalari");
    if (!fs.existsSync(fp)) throw new Error("dosya yok");
    const orig = fs.readFileSync(fp); const m0 = await sharp(orig).metadata();
    row.before = `${m0.width}x${m0.height} ${(orig.length / 1024).toFixed(1)}KB`;
    const state = { quality: QUALITY, notes: [] };
    let buf = orig;
    for (const o of ops) buf = await applyOp(buf, o, state);
    const final = await sharp(buf).webp({ quality: state.quality, effort: 4, smartSubsample: true }).toBuffer();
    const m1 = await sharp(final).metadata();
    if (m1.width > m0.width || m1.height > m0.height) throw new Error("sonuc kaynaktan buyuk (upscale engellendi)");
    row.after = `${m1.width}x${m1.height} ${(final.length / 1024).toFixed(1)}KB`;
    row.delta = `${(((final.length - orig.length) / orig.length) * 100).toFixed(0)}%`;
    if (state.notes.length) row.note = state.notes.join("; ");
    if (!DRY) {
      const bp = path.join(BACKUP, file);
      if (!fs.existsSync(bp)) fs.copyFileSync(fp, bp); // ilk yedegi koru
      fs.writeFileSync(fp, final);
    }
    changed++;
  } catch (e) { row.error = String(e.message || e); errors++; }
  rows.push(row);
}
console.log(DRY ? "== DRY-RUN (hicbir dosya degismedi) ==" : `== Uygulandi; yedek: ${BACKUP} ==`);
console.log("dosya | islem | once | sonra | boyut degisimi");
for (const r of rows) console.log(`${r.file} | ${r.ops} | ${r.before ?? "-"} | ${r.after ?? "-"} | ${r.delta ?? "-"}${r.note ? " | " + r.note : ""}${r.error ? " | HATA: " + r.error : ""}`);
console.log(`Toplam: ${rows.length} dosya, ${changed} basarili, ${errors} hata${DRY ? " (dry-run)" : ""}`);
if (errors) process.exitCode = 1;
