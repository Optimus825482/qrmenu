// At-rest encryption for secrets stored in the database (SMTP password): AES-256-GCM with a key derived
// (HKDF-SHA256) from `SETTINGS_SECRET_KEY`, falling back to `SESSION_SECRET`. Format: `enc:v1:<iv>.<tag>.<ct>` (base64url).
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";
import { env } from "@/lib/env";

const PREFIX = "enc:v1:";
const INFO = "merit-os:secret-box:v1";

let cached: { source: string; key: Buffer } | undefined;

function key(): Buffer {
  const source = env.SETTINGS_SECRET_KEY ?? env.SESSION_SECRET;
  if (!source) throw new Error("SETTINGS_SECRET_KEY veya SESSION_SECRET tanımlı olmalı");
  if (cached?.source !== source) {
    cached = { source, key: Buffer.from(hkdfSync("sha256", source, "merit-os", INFO, 32)) };
  }
  return cached.key;
}

export function isSealed(value: string): boolean {
  return value.startsWith(PREFIX);
}

export function sealSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const parts = [iv, cipher.getAuthTag(), ct].map((b) => b.toString("base64url"));
  return PREFIX + parts.join(".");
}

/** Plain text of a sealed value; a damaged value or a different key gives `null`. */
export function openSecret(stored: string): string | null {
  if (!isSealed(stored)) return null;
  const parts = stored.slice(PREFIX.length).split(".");
  if (parts.length !== 3) return null;
  try {
    const [iv, tag, ct] = parts.map((p) => Buffer.from(p, "base64url")) as [Buffer, Buffer, Buffer];
    if (iv.length !== 12 || tag.length !== 16) return null;
    const decipher = createDecipheriv("aes-256-gcm", key(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}
