/**
 * Menü kapak görsellerini üretir (public/merit-menus/kapak-*.jpg). Basılı menü kapağı olmayan satış noktaları
 * için: otelin logosu, satış noktasının adı ve konseptine uygun bir çizgi motif, noktanın kendi tema renkleri ve
 * başlık yazı tipiyle. Whiskey Lounge, The Roof Garden ve Blue Sea'nin kapakları basılı menülerinden gelir; burada
 * üretilmez.
 *
 *   npx tsx scripts/generate-menu-covers.ts            # hepsini yeniden üretir
 *   npx tsx scripts/generate-menu-covers.ts tea-lounge # yalnız adı geçenleri
 *
 * Renk ya da yazı tipi değişirse COVERS listesini prisma/seed/menuDesigns.ts ve menuThemes.ts ile birlikte güncelleyin.
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "@playwright/test";
import sharp from "sharp";

const ROOT = path.resolve(__dirname, "..");
const OUT_DIR = path.join(ROOT, "public", "merit-menus");
// 4:3, the frame the guest page shows a cover in (guest.css .g-hero-cover): nothing is cropped.
const WIDTH = 1200;
const HEIGHT = 900;

type Motif = "cloche" | "coupe" | "sun" | "teacup" | "leaf" | "cutlery" | "bowl" | "olive";
type Hotel = "diamond" | "royal" | "premium";

export interface CoverSpec {
  /** File name: kapak-<slug>.jpg */
  slug: string;
  hotel: Hotel;
  title: string;
  /** Small line under the title. */
  subtitle: string;
  motif: Motif;
  /** Theme colours of the outlet (menuThemes.ts). */
  bg: string;
  accent: string;
  soft: string;
  /** Hero font of the outlet (menuDesigns.ts). */
  font: "cinzel" | "cormorant" | "playfair" | "greatvibes" | "montserrat" | "jakarta" | "bodoni";
}

export const COVERS: CoverSpec[] = [
  { slug: "oda-servisi-diamond", hotel: "diamond", title: "Oda Servisi", subtitle: "In-Room Dining", motif: "cloche", bg: "#faf8f5", accent: "#785028", soft: "#f0ebe1", font: "cinzel" },
  { slug: "oda-servisi-royal", hotel: "royal", title: "Oda Servisi", subtitle: "In-Room Dining", motif: "cloche", bg: "#fdfbf7", accent: "#8c6218", soft: "#f4eee1", font: "cinzel" },
  { slug: "oda-servisi-premium", hotel: "premium", title: "Oda Servisi", subtitle: "In-Room Dining", motif: "cloche", bg: "#fcf9f2", accent: "#7c5832", soft: "#f2eadb", font: "cinzel" },
  { slug: "diamond-lobby-bar", hotel: "diamond", title: "Lobby Bar", subtitle: "Menu", motif: "coupe", bg: "#faf8f5", accent: "#785028", soft: "#f0ebe1", font: "cormorant" },
  { slug: "royal-lobby-bar", hotel: "royal", title: "Lobby Bar", subtitle: "Menu", motif: "coupe", bg: "#f9fbff", accent: "#1e3f7a", soft: "#eaeff8", font: "playfair" },
  { slug: "premium-lobby-bar", hotel: "premium", title: "Lobby Bar", subtitle: "Menu", motif: "coupe", bg: "#fcf9f2", accent: "#7c5832", soft: "#f2eadb", font: "cormorant" },
  { slug: "diamond-pool-bar", hotel: "diamond", title: "Pool Bar", subtitle: "Menu", motif: "sun", bg: "#f5fbfc", accent: "#0d6973", soft: "#e1f1f4", font: "montserrat" },
  { slug: "premium-pool-bar", hotel: "premium", title: "Pool Bar", subtitle: "Menu", motif: "sun", bg: "#fffdf6", accent: "#a84b00", soft: "#faefd8", font: "jakarta" },
  { slug: "tea-lounge", hotel: "diamond", title: "Tea Lounge", subtitle: "Menu", motif: "teacup", bg: "#fff8f9", accent: "#9e3a58", soft: "#f8eaee", font: "greatvibes" },
  { slug: "the-steakhouse", hotel: "diamond", title: "The Steakhouse", subtitle: "Menu", motif: "cutlery", bg: "#f7f4ee", accent: "#2e2b28", soft: "#ebe5da", font: "playfair" },
  { slug: "royal-mandarin", hotel: "royal", title: "Royal Mandarin", subtitle: "Menu", motif: "bowl", bg: "#fbfbf8", accent: "#8c1c22", soft: "#e7efe9", font: "cinzel" },
  { slug: "bella-merit", hotel: "royal", title: "Bella Merit", subtitle: "Menu", motif: "olive", bg: "#faf7ee", accent: "#556328", soft: "#eeecdc", font: "bodoni" },
  { slug: "cafe-verde", hotel: "premium", title: "Cafe Verde", subtitle: "Menu", motif: "leaf", bg: "#f7fbf8", accent: "#2d6a4f", soft: "#e6f2ea", font: "playfair" },
];

const FONTS: Record<CoverSpec["font"], { file: string; family: string; css: string }> = {
  cinzel: { file: "cinzel.ttf", family: "Cinzel", css: "font-weight:500; letter-spacing:0.08em; text-transform:uppercase; font-size:92px;" },
  cormorant: { file: "cormorant-garamond.ttf", family: "Cormorant Garamond", css: "font-weight:500; letter-spacing:0.02em; font-size:128px;" },
  playfair: { file: "playfair-display.ttf", family: "Playfair Display", css: "font-weight:500; letter-spacing:0.01em; font-size:112px;" },
  greatvibes: { file: "great-vibes.ttf", family: "Great Vibes", css: "font-weight:400; font-size:150px; line-height:1.15;" },
  montserrat: { file: "montserrat.ttf", family: "Montserrat", css: "font-weight:300; letter-spacing:0.16em; text-transform:uppercase; font-size:92px;" },
  bodoni: { file: "bodoni-moda.ttf", family: "Bodoni Moda", css: "font-weight:500; letter-spacing:0.02em; font-size:112px;" },
  jakarta: { file: "plus-jakarta-sans.ttf", family: "Plus Jakarta Sans", css: "font-weight:300; letter-spacing:0.14em; text-transform:uppercase; font-size:92px;" },
};

/** Line drawings, 120x120, stroked in the accent colour. */
const MOTIFS: Record<Motif, string> = {
  cloche: `<path d="M22 84a38 38 0 0 1 76 0"/><path d="M12 84h96"/><path d="M20 92h80"/><circle cx="60" cy="40" r="5"/><path d="M40 68a22 22 0 0 1 14-14"/>`,
  coupe: `<path d="M26 26h68L60 66Z"/><path d="M60 66v34"/><path d="M40 102h40"/><path d="M36 38h48"/><circle cx="72" cy="30" r="5"/><path d="M76 26l10-12"/>`,
  sun: `<path d="M34 62a26 26 0 0 1 52 0"/><path d="M60 18v10M30 30l7 7M90 30l-7 7M14 60h10M96 60h10"/><path d="M12 78c8-7 16-7 24 0s16 7 24 0 16-7 24 0 16 7 24 0"/><path d="M12 94c8-7 16-7 24 0s16 7 24 0 16-7 24 0 16 7 24 0"/>`,
  teacup: `<path d="M24 50h60v14a30 30 0 0 1-60 0Z"/><path d="M84 54h8a10 10 0 0 1 0 20h-10"/><path d="M14 102h80"/><path d="M42 36c-5-6 5-9 0-16M58 36c-5-6 5-9 0-16M74 36c-5-6 5-9 0-16"/>`,
  cutlery: `<path d="M40 16v30a10 10 0 0 0 20 0V16"/><path d="M50 16v88"/><path d="M82 104V16c-12 8-16 24-16 44h16"/>`,
  bowl: `<path d="M18 62h84a42 42 0 0 1-84 0Z"/><path d="M44 104h32"/><path d="M34 50l56-34M46 54l52-26"/>`,
  olive: `<path d="M22 98c22-10 50-38 76-76"/><ellipse cx="52" cy="50" rx="8" ry="15" transform="rotate(-40 52 50)"/><ellipse cx="76" cy="62" rx="8" ry="15" transform="rotate(50 76 62)"/><ellipse cx="40" cy="74" rx="7" ry="13" transform="rotate(60 40 74)"/><circle cx="68" cy="34" r="7"/>`,
  leaf: `<path d="M60 108V44"/><path d="M60 44c0-16 10-26 26-30 2 18-8 30-26 30Z"/><path d="M60 66c-2-14-12-22-28-24 0 16 10 26 28 24Z"/><path d="M60 88c2-12 12-18 26-18-2 14-12 20-26 18Z"/>`,
};

function html(spec: CoverSpec): string {
  const font = FONTS[spec.font];
  const fontUrl = pathToFileURL(path.join(ROOT, "public", "fonts", font.file)).href;
  const capsUrl = pathToFileURL(path.join(ROOT, "public", "fonts", "montserrat.ttf")).href;
  const logoUrl = pathToFileURL(path.join(ROOT, "public", "brand", "hotels", `${spec.hotel}.png`)).href;
  return `<!doctype html><html lang="tr"><head><meta charset="utf-8"><style>
@font-face { font-family: "${font.family}"; src: url("${fontUrl}"); font-weight: 100 900; }
@font-face { font-family: "CoverCaps"; src: url("${capsUrl}"); font-weight: 100 900; }
* { box-sizing: border-box; margin: 0; }
body { width: ${WIDTH}px; height: ${HEIGHT}px; background: radial-gradient(circle at 50% 42%, ${spec.bg} 0%, ${spec.bg} 46%, ${spec.soft} 100%); color: ${spec.accent}; position: relative; overflow: hidden; }
.frame { position: absolute; inset: 44px; border: 3px solid ${spec.accent}; }
.frame.thin { inset: 62px; border-width: 1px; opacity: 0.6; }
.corner { position: absolute; width: 26px; height: 26px; background: ${spec.bg}; border: 3px solid ${spec.accent}; transform: rotate(45deg); }
.corner.tl { left: 32px; top: 32px; } .corner.tr { right: 32px; top: 32px; }
.corner.bl { left: 32px; bottom: 32px; } .corner.br { right: 32px; bottom: 32px; }
main { position: absolute; inset: 62px; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 14px 60px; }
.logo { height: 176px; margin-bottom: 18px; }
.motif { width: 128px; height: 128px; margin-bottom: 8px; fill: none; stroke: ${spec.accent}; stroke-width: 2.6; stroke-linecap: round; stroke-linejoin: round; }
h1 { font-family: "${font.family}", serif; ${font.css} line-height: 1.1; white-space: nowrap; }
.rule { display: flex; align-items: center; gap: 18px; margin: 22px 0 20px; }
.rule i { display: block; width: 150px; height: 2px; background: ${spec.accent}; opacity: 0.75; }
.rule b { display: block; width: 14px; height: 14px; background: ${spec.accent}; transform: rotate(45deg); }
p { font-family: "CoverCaps", sans-serif; font-weight: 400; font-size: 30px; letter-spacing: 0.42em; margin-right: -0.42em; text-transform: uppercase; }
</style></head><body>
<div class="frame"></div><div class="frame thin"></div>
<div class="corner tl"></div><div class="corner tr"></div><div class="corner bl"></div><div class="corner br"></div>
<main>
  <img class="logo" src="${logoUrl}" alt="">
  <svg class="motif" viewBox="0 0 120 120">${MOTIFS[spec.motif]}</svg>
  <h1>${spec.title}</h1>
  <div class="rule"><i></i><b></b><i></i></div>
  <p lang="en">${spec.subtitle}</p>
</main></body></html>`;
}

async function main() {
  const only = process.argv.slice(2);
  const unknown = only.filter((slug) => !COVERS.some((c) => c.slug === slug));
  if (unknown.length) throw new Error(`Bilinmeyen kapak: ${unknown.join(", ")}`);
  const specs = only.length ? COVERS.filter((c) => only.includes(c.slug)) : COVERS;
  const tmp = mkdtempSync(path.join(os.tmpdir(), "merit-kapak-"));
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 1 });
    for (const spec of specs) {
      const file = path.join(tmp, `${spec.slug}.html`);
      writeFileSync(file, html(spec), "utf8");
      await page.goto(pathToFileURL(file).href);
      await page.evaluate(() => document.fonts.ready);
      const png = await page.screenshot({ type: "png" });
      const out = path.join(OUT_DIR, `kapak-${spec.slug}.jpg`);
      const info = await sharp(png).jpeg({ quality: 86, mozjpeg: true }).toFile(out);
      console.log(`kapak-${spec.slug}.jpg  ${info.width}x${info.height}  ${Math.round(info.size / 1024)} KB`);
    }
  } finally {
    await browser.close();
    rmSync(tmp, { recursive: true, force: true });
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
