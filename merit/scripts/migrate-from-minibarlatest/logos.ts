import sharp from "sharp";

export type LogoReject = "BOS" | "GECERSIZ_BASE64" | "GORSEL_DEGIL" | "SVG_DESTEKLENMEZ";
export type LogoDecode = { ok: true; bytes: Buffer } | { ok: false; reason: LogoReject };

const DATA_PREFIX = /^data:([a-z0-9.+/-]*);base64,/i;

function isImage(b: Buffer): boolean {
  if (b.length < 12) return false;
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return true; // PNG
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return true; // JPEG
  if (b.subarray(0, 4).toString("latin1") === "GIF8") return true;
  return b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP";
}

/** Legacy `oteller.logo` (base64, with or without a data: prefix) to image bytes, or the reason it cannot be used. */
export function decodeLogo(raw: string | null | undefined): LogoDecode {
  const trimmed = (raw ?? "").trim();
  if (trimmed === "") return { ok: false, reason: "BOS" };
  const prefix = DATA_PREFIX.exec(trimmed);
  const body = prefix ? trimmed.slice(prefix[0].length) : trimmed;
  if (prefix && /svg/i.test(prefix[1])) return { ok: false, reason: "SVG_DESTEKLENMEZ" };
  if (/^\s*(<svg|<\?xml)/i.test(body)) return { ok: false, reason: "SVG_DESTEKLENMEZ" };
  const compact = body.replace(/\s+/g, "");
  if (compact === "" || !/^[A-Za-z0-9+/]+={0,2}$/.test(compact) || compact.length % 4 === 1) {
    return { ok: false, reason: "GECERSIZ_BASE64" };
  }
  const bytes = Buffer.from(compact, "base64");
  if (/^\s*(<svg|<\?xml)/i.test(bytes.subarray(0, 64).toString("utf8"))) return { ok: false, reason: "SVG_DESTEKLENMEZ" };
  if (!isImage(bytes)) return { ok: false, reason: "GORSEL_DEGIL" };
  return { ok: true, bytes };
}

/** PNG, longest side at most 600 px, never enlarged. */
export async function toPng(bytes: Buffer): Promise<Buffer> {
  return sharp(bytes)
    .rotate()
    .resize({ width: 600, height: 600, fit: "inside", withoutEnlargement: true })
    .png()
    .toBuffer();
}
