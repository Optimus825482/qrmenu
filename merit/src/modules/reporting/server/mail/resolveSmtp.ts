import { prisma } from "@/lib/prisma";
import { openSecret } from "@/lib/secret-box";
import { maskEmail, maskUser, type SmtpConfig, type SmtpSecurity, type SmtpSource } from "./transport";

export type ResolvedSmtp = { config: SmtpConfig; source: SmtpSource };

const KEYS = ["smtp.host", "smtp.port", "smtp.security", "smtp.user", "smtp.password", "smtp.fromEmail", "smtp.fromName"] as const;
type Key = (typeof KEYS)[number];
type Row = Partial<Record<Key, unknown>>;

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

function toConfig(r: Row): SmtpConfig | null {
  const host = str(r["smtp.host"]);
  const fromEmail = str(r["smtp.fromEmail"]);
  const user = str(r["smtp.user"]);
  const sealed = typeof r["smtp.password"] === "string" ? (r["smtp.password"] as string) : "";
  if (!host || !fromEmail) return null;
  // user and password come as a pair
  if (Boolean(user) !== Boolean(sealed)) return null;
  let password = "";
  if (sealed) {
    const open = openSecret(sealed);
    if (open === null) return null;
    password = open;
  }
  const security = (["NONE", "STARTTLS", "SSL"] as const).includes(r["smtp.security"] as SmtpSecurity)
    ? (r["smtp.security"] as SmtpSecurity)
    : "STARTTLS";
  const port = Number.isInteger(r["smtp.port"]) ? (r["smtp.port"] as number) : 587;
  return { host, port, security, user, password, fromEmail, fromName: str(r["smtp.fromName"]) || "Merit Royal" };
}

function fromEnv(): SmtpConfig | null {
  const host = process.env.SMTP_HOST?.trim();
  const user = process.env.SMTP_USER?.trim() ?? "";
  if (!host || !user) return null;
  const port = Number(process.env.SMTP_PORT || 587);
  const from = process.env.SMTP_FROM?.trim() || user;
  const match = /^\s*(?:"?([^"<]*)"?\s*)?<([^>]+)>\s*$/.exec(from);
  return {
    host,
    port,
    security: port === 465 ? "SSL" : "STARTTLS",
    user,
    password: process.env.SMTP_PASS ?? "",
    fromEmail: (match ? match[2]! : from).trim(),
    fromName: match?.[1]?.trim() || "Merit Royal",
  };
}

/**
 * SMTP for a hotel: the hotel's `smtp.*` rows, else the system rows (a hotel row only counts when it
 * names a host), else the legacy SMTP_* environment — the environment is used ONLY when no
 * `smtp.host` is stored anywhere, so a half-filled panel never silently falls back to env.
 * `null` = not usable (no host/from, or user without password, or an unreadable sealed password).
 */
export async function resolveSmtp(hotelId?: string | null): Promise<ResolvedSmtp | null> {
  const rows = await prisma.setting.findMany({
    where: { key: { in: [...KEYS] }, OR: [{ hotelId: null }, ...(hotelId ? [{ hotelId }] : [])] },
    select: { key: true, hotelId: true, value: true },
  });
  const pick = (scope: string | null): Row => {
    const out: Row = {};
    for (const r of rows) if (r.hotelId === scope) out[r.key as Key] = r.value;
    return out;
  };
  const system = pick(null);
  const hotel = hotelId ? pick(hotelId) : {};
  const hotelHasHost = str(hotel["smtp.host"]) !== "";
  const systemHasHost = str(system["smtp.host"]) !== "";

  if (hotelHasHost) {
    // A hotel that names its own host uses only its own rows: system credentials must never be sent to a
    // host chosen in hotel scope. Cosmetic sender fields may still fall back to the system row.
    const cfg = toConfig({
      "smtp.fromName": system["smtp.fromName"],
      "smtp.fromEmail": system["smtp.fromEmail"],
      ...hotel,
    });
    return cfg ? { config: cfg, source: "hotel" } : null;
  }
  if (systemHasHost) {
    const cfg = toConfig(system);
    return cfg ? { config: cfg, source: "system" } : null;
  }
  const env = fromEnv();
  return env ? { config: env, source: "env" } : null;
}

/** Host/port/user without the password, for the test-send result panel. */
export function maskedSmtp(r: ResolvedSmtp) {
  const { host, port, security, user, fromEmail } = r.config;
  const maskedUser = maskUser(user);
  return { source: r.source, host, port, security, user: maskedUser, fromEmail: maskEmail(fromEmail) };
}
