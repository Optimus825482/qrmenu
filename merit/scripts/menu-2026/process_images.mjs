// Crops, enhances and converts the matched source images to square WebP files. Run with cwd = merit (uses its sharp).
// usage: node process_images.mjs <jobs.json> <sourceRoot> <outDir> [--only N]
import { createRequire } from "node:module";
import { mkdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const require = createRequire(path.join(process.cwd(), "package.json"));
const sharp = require("sharp");

const [jobsFile, srcRoot, outDir] = process.argv.slice(2);
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
    const img = isCutout ? await cutout(input) : await photo(source, info);
    await img.webp({ quality: isCutout ? 86 : 80, effort: 5 }).toFile(output);
    bytesIn += statSync(input).size;
    bytesOut += statSync(output).size;
    done += 1;
  } catch (error) {
    failed.push(`${job.src}: ${error.message}`);
  }
}
console.log(`${done}/${jobs.length} görsel işlendi: ${(bytesIn / 1e6).toFixed(1)} MB -> ${(bytesOut / 1e6).toFixed(1)} MB`);
if (failed.length) console.log("HATALI:\n" + failed.join("\n"));
