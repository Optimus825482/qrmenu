import fs from "node:fs/promises";
import path from "node:path";
import { env } from "@/lib/env";
import { DomainError } from "@/lib/result";

export const UPLOADS_ROOT = env.UPLOADS_DIR ?? path.join(process.cwd(), "uploads");

export const UPLOAD_CONTENT_TYPES: Record<string, string> = {
  ".webp": "image/webp",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
};

/** Resolves `relPath` inside the uploads root; anything that could leave it is VALIDATION. */
function resolveInside(relPath: string): string {
  const normalized = relPath.replaceAll("\\", "/");
  if (
    normalized === "" ||
    normalized.includes("\0") ||
    normalized.startsWith("/") ||
    /^[A-Za-z]:/.test(normalized) ||
    normalized.split("/").some((part) => part === ".." || part === "." || part === "")
  ) {
    throw new DomainError("VALIDATION", "Geçersiz dosya yolu");
  }
  const root = path.resolve(UPLOADS_ROOT);
  const full = path.resolve(root, normalized);
  if (!full.startsWith(root + path.sep)) throw new DomainError("VALIDATION", "Geçersiz dosya yolu");
  return full;
}

export async function saveUpload(relPath: string, data: Buffer): Promise<void> {
  const full = resolveInside(relPath);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, data);
}

/** A missing file is not an error. */
export async function removeUpload(relPath: string): Promise<void> {
  await fs.rm(resolveInside(relPath), { force: true });
}

export async function readUpload(
  relPath: string,
): Promise<{ data: Buffer; contentType: string } | null> {
  const full = resolveInside(relPath);
  const contentType = UPLOAD_CONTENT_TYPES[path.extname(full).toLowerCase()];
  if (!contentType) return null;
  try {
    return { data: await fs.readFile(full), contentType };
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "EISDIR") return null;
    throw error;
  }
}
