import { existsSync, mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { decodeLogo } from "./migrate-from-minibarlatest/logos";

export type LogoExt = "png" | "jpg" | "webp";

/** File extension from the detected magic bytes (never from the declared media type); null for anything else. */
export function detectLogoExt(b: Buffer): LogoExt | null {
  if (b.length >= 4 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "png";
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpg";
  if (b.length >= 12 && b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP") {
    return "webp";
  }
  return null;
}

const EXTENSIONS: LogoExt[] = ["png", "jpg", "webp"];

/**
 * Writes the hotel logo under `dir` as `<code>.<ext>` (png/jpg/webp only, by magic bytes) and returns its
 * public URL, or null when the legacy value is empty/SVG/not an allowed image. A stale file with another
 * extension for the same hotel code is removed (also when no usable logo remains).
 */
export function writeHotelLogo(dir: string, code: string, raw: string): string | null {
  const decoded = decodeLogo(raw);
  const ext = decoded.ok ? detectLogoExt(decoded.bytes) : null;
  const base = code.toLowerCase();
  mkdirSync(dir, { recursive: true });
  for (const other of [...EXTENSIONS, "gif", "svg"]) {
    if (other === ext) continue;
    const stale = path.join(dir, `${base}.${other}`);
    if (existsSync(stale)) unlinkSync(stale);
  }
  if (!decoded.ok || !ext) return null;
  writeFileSync(path.join(dir, `${base}.${ext}`), decoded.bytes);
  return `/brand/hotels/${base}.${ext}`;
}
