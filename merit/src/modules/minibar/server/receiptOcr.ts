import { randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
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

const MAX_BYTES = 8 * 1024 * 1024;
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

/** Plain text of the image, line by line as printed. */
export async function ocrImage(data: Buffer): Promise<string> {
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker([...LANGS], 1, { langPath: await languageDir(), cacheMethod: "none", gzip: true });
  try {
    const result = await worker.recognize(data);
    return result.data.text;
  } finally {
    await worker.terminate();
  }
}

export type OcrPreview = { imageToken: string; text: string; lines: ParsedLine[] };

/** Stores the document image and returns the products and quantities read from it (stock managers only). */
export async function previewReceiptImage(ctx: Ctx, data: Buffer): Promise<OcrPreview> {
  assertStockManager(ctx);
  if (data.length === 0) throw new DomainError("VALIDATION", "Evrak görseli boş");
  if (data.length > MAX_BYTES) throw new DomainError("VALIDATION", "Evrak görseli en fazla 8 MB olabilir");
  const ext = kindOf(data);
  if (!ext) throw new DomainError("VALIDATION", "Evrak görseli JPG ya da PNG olmalıdır");
  let text: string;
  try {
    text = await ocrImage(data);
  } catch (error) {
    console.error("[receiptOcr] görsel okunamadı", error);
    throw new DomainError("VALIDATION", "Görsel okunamadı; daha net bir fotoğraf deneyin ya da ürünleri elle girin");
  }
  const imageToken = `${randomBytes(12).toString("hex")}.${ext}`;
  await saveUpload(`receipts/${imageToken}`, data);
  return { imageToken, text, lines: parseReceiptText(text, await receiptProducts()) };
}
