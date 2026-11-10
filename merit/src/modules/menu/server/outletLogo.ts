import { createHash } from "node:crypto";
import sharp from "sharp";
import type { Ctx } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { DomainError } from "@/lib/result";
import { saveUploadExclusive } from "@/lib/uploads";
import { outletLogoPrefix } from "../design";
import { assertOutletScope } from "./menuNodeAccess";
import type { UploadFile } from "./menuImages";

export const MAX_LOGO_BYTES = 2 * 1024 * 1024;
const TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const REAL_FORMATS = new Set(["jpeg", "png", "webp"]);
const MAX_INPUT_PIXELS = 40_000_000;

/**
 * Stores an outlet logo for the guest menu and returns its URL. The design is not changed here: the studio puts the
 * URL into the draft (`options.logoUrl`) and it goes live with the next "save". Transparency is kept.
 */
export async function uploadOutletLogo(ctx: Ctx, outletId: string, file: UploadFile): Promise<{ logoUrl: string }> {
  const outlet = await prisma.outlet.findUnique({ where: { id: outletId }, select: { hotelId: true } });
  if (!outlet) throw new DomainError("NOT_FOUND", "Outlet bulunamadı");
  assertOutletScope(ctx, outletId);
  if (!(await can(ctx, "QM-TEM", "D", outlet.hotelId)) && !(await can(ctx, "QM-MEN", "D", outlet.hotelId))) {
    throw new DomainError("FORBIDDEN", "Bu işlem için yetkiniz yok");
  }
  if (!TYPES.has(file.type)) throw new DomainError("VALIDATION", "Logo yalnız JPEG, PNG veya WebP olabilir");
  if (file.bytes.length > MAX_LOGO_BYTES || file.size > MAX_LOGO_BYTES) {
    throw new DomainError("VALIDATION", "Logo 2 MB'ı aşamaz");
  }
  let webp: Buffer;
  try {
    const meta = await sharp(file.bytes, { limitInputPixels: MAX_INPUT_PIXELS }).metadata();
    if (!meta.format || !REAL_FORMATS.has(meta.format)) {
      throw new DomainError("VALIDATION", "Logo yalnız JPEG, PNG veya WebP olabilir");
    }
    webp = await sharp(file.bytes, { limitInputPixels: MAX_INPUT_PIXELS })
      .rotate()
      .resize({ width: 640, height: 640, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 90, alphaQuality: 100 })
      .toBuffer();
  } catch (error) {
    if (error instanceof DomainError) throw error;
    throw new DomainError("VALIDATION", "Logo okunamadı");
  }
  const hash = createHash("sha256").update(webp).digest("hex").slice(0, 16);
  const logoUrl = `${outletLogoPrefix(outletId)}${hash}.webp`;
  await saveUploadExclusive(logoUrl.slice("/uploads/".length), webp);
  return { logoUrl };
}
