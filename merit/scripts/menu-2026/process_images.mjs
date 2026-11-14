// Crops, enhances and converts the matched source images to square WebP files. Run with cwd = merit (uses its sharp).
// usage: node process_images.mjs <jobs.json> <sourceRoot> <outDir> [--packshots-only]
// --packshots-only rewrites only the product pictures on a plain white background (bottles, cans) and leaves the rest.
import { createRequire } from "node:module";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

const require = createRequire(path.join(process.cwd(), "package.json"));
const sharp = require("sharp");

const [jobsFile, srcRoot, outDir] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const PACKSHOTS_ONLY = process.argv.includes("--packshots-only");
const jobs = JSON.parse(readFileSync(jobsFile, "utf8"));
mkdirSync(outDir, { recursive: true });

const SIZE = 800;
const WHITE = { r: 255, g: 255, b: 255, alpha: 1 };

/** Bottle cut-outs (transparent PNG): trim the empty margin, centre on white with breathing room. Never cropped. */
async function cutout(input) {
  const trimmed = await sharp(input).trim({ threshold: 8 }).toBuffer();
  const box = Math.round(SIZE * 0.82);
  const body = await sharp(trimmed)
    .resize(box, box, { fit: "inside", kernel: "lanczos3" })
    .sharpen({ sigma: 0.5 })
    .toBuffer();
  return sharp({ create: { width: SIZE, height: SIZE, channels: 4, background: WHITE } })
    .composite([{ input: body, gravity: "centre" }])
    .flatten({ background: WHITE });
}

/**
 * A product on a plain white background (bottle, can) that is not a transparent cut-out. Returns the product's
 * bounding box, or null for an ordinary photograph. Such a picture must never go through photo(): its square
 * "attention" crop keeps only the label of a tall bottle, at the source's narrow width (a 146x346 bottle became
 * an 84x84 close-up of its label).
 */
async function packshotBox(input) {
  const flat = await sharp(input).rotate().flatten({ background: WHITE }).toBuffer();
  const { data, info } = await sharp(flat).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h, channels: c } = info;
  const white = (x, y) => {
    const i = (y * w + x) * c;
    return Math.min(data[i], data[i + 1], data[i + 2]) >= 236;
  };
  let ring = 0;
  let ringWhite = 0;
  for (let x = 0; x < w; x++) for (const y of [0, 1, h - 2, h - 1]) (ring++, white(x, y) && ringWhite++);
  for (let y = 0; y < h; y++) for (const x of [0, 1, w - 2, w - 1]) (ring++, white(x, y) && ringWhite++);
  if (ringWhite / ring < 0.97) return null;
  let trimmed;
  try {
    trimmed = await sharp(flat).trim({ background: "#ffffff", threshold: 14 }).toBuffer({ resolveWithObject: true });
  } catch {
    return null;
  }
  const { width: tw, height: th } = trimmed.info;
  // A tall product, or a small one lost in a big white canvas. A plate photographed on white fills its frame.
  const tall = th / tw >= 1.15;
  const small = (tw * th) / (w * h) < 0.6;
  return tall || small ? trimmed.data : null;
}

/** Packshots: the whole product, centred on white with breathing room. Never cropped. */
async function packshot(content) {
  const box = Math.round(SIZE * 0.8);
  const body = await sharp(content)
    .resize(box, box, { fit: "inside", kernel: "lanczos3" })
    .sharpen({ sigma: 0.6, m1: 0.5, m2: 1.2 })
    .toBuffer();
  return sharp({ create: { width: SIZE, height: SIZE, channels: 3, background: WHITE } }).composite([
    { input: body, gravity: "centre" },
  ]);
}

/** Photographs: honour EXIF rotation, crop to a square around the subject, gentle tone and sharpness lift. */
async function photo(input, meta) {
  const w = meta.orientation && meta.orientation >= 5 ? meta.height : meta.width;
  const h = meta.orientation && meta.orientation >= 5 ? meta.width : meta.height;
  const side = Math.min(SIZE, Math.min(w, h));
  let img = sharp(input).rotate().flatten({ background: WHITE });
  if (w !== h) img = img.resize(side, side, { fit: "cover", position: sharp.strategy.attention, kernel: "lanczos3" });
  else if (w > SIZE) img = img.resize(SIZE, SIZE, { kernel: "lanczos3" });
  return img
    .normalise({ lower: 0.5, upper: 99.5 })
    .modulate({ saturation: 1.06 })
    .sharpen({ sigma: 0.6, m1: 0.6, m2: 1.4 });
}

let done = 0;
let bytesIn = 0;
let bytesOut = 0;
const failed = [];
const packshots = [];
for (const job of jobs) {
  const input = path.join(srcRoot, job.src);
  const output = path.join(outDir, job.out);
  try {
    const meta = await sharp(input).metadata();
    let source = input;
    let info = meta;
    let isCutout = false;
    if (meta.hasAlpha) {
      // A PNG with transparency is either a bottle cut-out or a rectangular photo sitting on an empty canvas.
      const trimmed = await sharp(input).trim({ threshold: 8 }).toBuffer({ resolveWithObject: true });
      const { data, info: raw } = await sharp(trimmed.data).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      const alphaAt = (x, y) => data[(y * raw.width + x) * 4 + 3];
      const corners = [alphaAt(2, 2), alphaAt(raw.width - 3, 2), alphaAt(2, raw.height - 3), alphaAt(raw.width - 3, raw.height - 3)];
      isCutout = corners.some((v) => v < 200);
      if (!isCutout) {
        source = trimmed.data;
        info = { width: raw.width, height: raw.height };
      }
    }
    const product = isCutout ? null : await packshotBox(input);
    if (PACKSHOTS_ONLY && !product) continue;
    if (product) packshots.push(job.out);
    const img = isCutout ? await cutout(input) : product ? await packshot(product) : await photo(source, info);
    await img.webp({ quality: isCutout || product ? 88 : 80, effort: 5 }).toFile(output);
    bytesIn += statSync(input).size;
    bytesOut += statSync(output).size;
    done += 1;
  } catch (error) {
    failed.push(`${job.src}: ${error.message}`);
  }
}
console.log(`${done}/${jobs.length} görsel işlendi: ${(bytesIn / 1e6).toFixed(1)} MB -> ${(bytesOut / 1e6).toFixed(1)} MB`);
console.log(`${packshots.length} ürün görseli (beyaz zemin) kırpılmadan ortalandı`);
if (process.env.PACKSHOT_LIST) writeFileSync(process.env.PACKSHOT_LIST, JSON.stringify(packshots));
if (failed.length) console.log("HATALI:\n" + failed.join("\n"));
