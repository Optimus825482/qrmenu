import { pbkdf2, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import bcrypt from "bcryptjs";

const pbkdf2Async = promisify(pbkdf2);

const BCRYPT_ROUNDS = 12;
const PBKDF2_PREFIX = "pbkdf2:sha256:";
const PBKDF2_KEY_BYTES = 32;
/** Upper bound for the iteration count read from a stored hash (guards against a hostile row). */
const PBKDF2_MAX_ITERATIONS = 10_000_000;

export type PasswordCheck = { ok: boolean; needsRehash: boolean };

const REJECT: PasswordCheck = { ok: false, needsRehash: false };

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

/** Werkzeug format: `pbkdf2:sha256:<iterations>$<salt>$<hex digest>`. */
async function verifyWerkzeug(plain: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 3) return false;
  const [method, salt, hex] = parts;

  const iterations = Number(method.slice(PBKDF2_PREFIX.length));
  if (!Number.isInteger(iterations) || iterations < 1 || iterations > PBKDF2_MAX_ITERATIONS) {
    return false;
  }
  // Exactly 64 hex digits; an odd-length digest would otherwise be silently truncated by Buffer.
  if (!salt || hex.length !== PBKDF2_KEY_BYTES * 2 || !/^[0-9a-f]+$/i.test(hex)) return false;

  const expected = Buffer.from(hex, "hex");

  const actual = await pbkdf2Async(plain, salt, iterations, PBKDF2_KEY_BYTES, "sha256");
  return timingSafeEqual(actual, expected);
}

/**
 * Checks a password against a stored hash. bcrypt hashes verify as-is; legacy Werkzeug pbkdf2
 * hashes verify too and report `needsRehash` so the caller can upgrade them. Any other (or
 * malformed) format is a plain mismatch, never an exception.
 */
export async function verifyPassword(plain: string, stored: string): Promise<PasswordCheck> {
  if (!stored) return REJECT;
  try {
    if (stored.startsWith("$2")) {
      return { ok: await bcrypt.compare(plain, stored), needsRehash: false };
    }
    if (stored.startsWith(PBKDF2_PREFIX)) {
      const ok = await verifyWerkzeug(plain, stored);
      return { ok, needsRehash: ok };
    }
  } catch {
    // malformed hash: treated as a mismatch
  }
  return REJECT;
}

export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 128;

/**
 * The staff password policy: at least 10 characters with an upper-case letter, a lower-case
 * letter and a digit (Turkish letters count). Returns the Turkish reason a password is rejected,
 * or `null` when it is acceptable. Applies to passwords being set, never to logins.
 */
export function passwordPolicyError(plain: string): string | null {
  if (plain.length < PASSWORD_MIN_LENGTH) return `Şifre en az ${PASSWORD_MIN_LENGTH} karakter olmalı`;
  if (plain.length > PASSWORD_MAX_LENGTH) return `Şifre en fazla ${PASSWORD_MAX_LENGTH} karakter olabilir`;
  if (!/\p{Lu}/u.test(plain)) return "Şifre en az bir büyük harf içermeli";
  if (!/\p{Ll}/u.test(plain)) return "Şifre en az bir küçük harf içermeli";
  if (!/\d/.test(plain)) return "Şifre en az bir rakam içermeli";
  return null;
}
