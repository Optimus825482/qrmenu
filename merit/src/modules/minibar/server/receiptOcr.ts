import { randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import type { Ctx } from "@/lib/auth";
import { DomainError } from "@/lib/result";
import { saveUpload } from "@/lib/uploads";
import { type ParsedLine, parseReceiptText } from "../receiptParse";
import { assertStockManager } from "./pool";
import { receiptProducts } from "./receipts";

/*
 * Reads a photo of a central-warehouse delivery document on this server (tesseract.js, WebAssembly): the image
 * is never sent to an outside service. The language data comes from the @tesseract.js-data packages in
 * node_modules, so no download happens at run time either. The text is only a suggestion: the user corrects the
 * preview before anything is saved.
 */

export const MAX_BYTES = 8 * 1024 * 1024;
/** A small file can still decode to a huge bitmap: the cap that matters for memory and OCR time is pixels. */
const MAX_PIXELS = 40_000_000;
/** OCR reads the image at this longest side at most; a phone photo of an A4 page stays legible. */
const OCR_MAX_SIDE = 2600;
/** One OCR at a time on this server, and only a few uploads may wait for their turn. */
const MAX_WAITING = 3;
const LANGS = ["tur", "eng"] as const;

const KINDS: { ext: "jpg" | "png"; magic: number[] }[] = [
  { ext: "jpg", magic: [0xff, 0xd8, 0xff] },
  { ext: "png", magic: [0x89, 0x50, 0x4e, 0x47] },
];

function kindOf(data: Buffer): "jpg" | "png" | null {
  return KINDS.find((kind) => kind.magic.every((byte, index) => data[index] === byte))?.ext ?? null;
}

let langDir: Promise<string> | null = null;

/** One folder holding both language files (tesseract takes a single `langPath`). */
function languageDir(): Promise<string> {
  langDir ??= (async () => {
    const dir = path.join(os.tmpdir(), "merit-ocr-lang");
    await fs.mkdir(dir, { recursive: true });
    for (const lang of LANGS) {
      const source = path.join(process.cwd(), "node_modules", "@tesseract.js-data", lang, "4.0.0_best_int", `${lang}.traineddata.gz`);
      const target = path.join(dir, `${lang}.traineddata.gz`);
      try {
        await fs.access(target);
      } catch {
        await fs.copyFile(source, target);
      }
    }
    return dir;
  })().catch((error) => {
    langDir = null;
    throw error;
  });
  return langDir;
}

/**
 * Checks the pixel size and re-encodes the upload as an upright JPEG of bounded size. What is stored and read
 * is this copy, never the uploaded bytes (so no EXIF data and no oversized bitmap reach disk or the OCR).
 */
export async function normalizeReceiptImage(data: Buffer): Promise<Buffer> {
  try {
    const meta = await sharp(data, { limitInputPixels: MAX_PIXELS }).metadata();
    if (!meta.width || !meta.height || meta.width * meta.height > MAX_PIXELS) throw new Error("too large");
    return await sharp(data, { limitInputPixels: MAX_PIXELS })
      .rotate()
      .resize({ width: OCR_MAX_SIDE, height: OCR_MAX_SIDE, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toBuffer();
  } catch {
    throw new DomainError("VALIDATION", "Evrak görseli açılamadı ya da çok büyük (en fazla 40 megapiksel)");
  }
}

let ocrTail: Promise<unknown> = Promise.resolve();
let ocrWaiting = 0;

/** Plain text of the image, line by line as printed. Runs one at a time; a full queue is refused. */
export async function ocrImage(data: Buffer): Promise<string> {
  if (ocrWaiting >= MAX_WAITING) {
    throw new DomainError("CONFLICT", "Şu anda başka evraklar okunuyor; biraz sonra yeniden deneyin");
  }
  ocrWaiting += 1;
  const run = ocrTail.then(async () => {
    const { createWorker } = await import("tesseract.js");
    const worker = await createWorker([...LANGS], 1, { langPath: await languageDir(), cacheMethod: "none", gzip: true });
    try {
      const result = await worker.recognize(data);
      return result.data.text;
    } finally {
      await worker.terminate();
    }
  });
  ocrTail = run.catch(() => undefined).finally(() => {
    ocrWaiting -= 1;
  });
  return run;
}

export type OcrPreview = { imageToken: string; text: string; lines: ParsedLine[] };

/** Stores the document image and returns the products and quantities read from it (stock managers only). */
export async function previewReceiptImage(ctx: Ctx, data: Buffer): Promise<OcrPreview> {
  assertStockManager(ctx);
  if (data.length === 0) throw new DomainError("VALIDATION", "Evrak görseli boş");
  if (data.length > MAX_BYTES) throw new DomainError("VALIDATION", "Evrak görseli en fazla 8 MB olabilir");
  if (!kindOf(data)) throw new DomainError("VALIDATION", "Evrak görseli JPG ya da PNG olmalıdır");
  const image = await normalizeReceiptImage(data);
  let text: string;
  try {
    text = await ocrImage(image);
  } catch (error) {
    if (error instanceof DomainError) throw error;
    console.error("[receiptOcr] görsel okunamadı", error);
    throw new DomainError("VALIDATION", "Görsel okunamadı; daha net bir fotoğraf deneyin ya da ürünleri elle girin");
  }
  const imageToken = `${randomBytes(12).toString("hex")}.jpg`;
  await saveUpload(`receipts/${imageToken}`, image);
  return { imageToken, text, lines: parseReceiptText(text, await receiptProducts()) };
}
