import nodemailer, { type Transporter } from "nodemailer";

export type SmtpSecurity = "NONE" | "STARTTLS" | "SSL";

export type SmtpConfig = {
  host: string;
  port: number;
  security: SmtpSecurity;
  user: string;
  password: string;
  fromEmail: string;
  fromName: string;
};

/** Where a resolved SMTP configuration came from. `env` = legacy SMTP_* variables (only when no settings exist). */
export type SmtpSource = "hotel" | "system" | "env";

export function createMailTransport(cfg: SmtpConfig): Transporter {
  return nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.security === "SSL",
    requireTLS: cfg.security === "STARTTLS",
    ignoreTLS: cfg.security === "NONE",
    auth: cfg.user ? { user: cfg.user, pass: cfg.password } : undefined,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 30_000,
  });
}

export type MailErrorCode =
  | "CONFIG"
  | "AUTH"
  | "CONNECT"
  | "TIMEOUT"
  | "REJECTED"
  | "TEMPORARY"
  | "UNKNOWN";

/** Retry class: `permanent` errors are dead-lettered at once, the others are retried with backoff. */
export type MappedMailError = { code: MailErrorCode; message: string; permanent: boolean };

const MESSAGES: Record<MailErrorCode, string> = {
  CONFIG: "SMTP ayarları yapılmamış",
  AUTH: "Kimlik doğrulama başarısız",
  CONNECT: "Sunucuya bağlanılamadı",
  TIMEOUT: "Zaman aşımı",
  REJECTED: "Alıcı veya gönderen reddedildi",
  TEMPORARY: "Sunucu geçici olarak reddetti",
  UNKNOWN: "Beklenmeyen e-posta hatası",
};

const PERMANENT: ReadonlySet<MailErrorCode> = new Set(["CONFIG", "AUTH", "REJECTED"]);

/** Classifies a nodemailer / SMTP error. The message is fixed Turkish text plus the SMTP code: raw server text (which may echo credentials) is never kept. */
export function mapSmtpError(err: unknown, secret?: string): MappedMailError {
  void secret; // raw text is never copied, so there is nothing to strip; kept for API symmetry
  const e = (err ?? {}) as { code?: unknown; responseCode?: unknown; message?: unknown };
  const code = typeof e.code === "string" ? e.code : "";
  const rc = typeof e.responseCode === "number" ? e.responseCode : undefined;

  let mapped: MailErrorCode;
  if (code === "ECONFIG") mapped = "CONFIG";
  else if (code === "EAUTH" || rc === 534 || rc === 535) mapped = "AUTH";
  else if (code === "EENVELOPE" || (rc !== undefined && rc >= 500 && rc < 600)) mapped = "REJECTED";
  else if (code === "ETIMEDOUT" || code === "ESOCKET" || code === "ESOCKETTIMEDOUT") mapped = "TIMEOUT";
  else if (["ECONNECTION", "ECONNREFUSED", "ENOTFOUND", "ECONNRESET", "EHOSTUNREACH"].includes(code))
    mapped = "CONNECT";
  else if (rc !== undefined && rc >= 400 && rc < 500) mapped = "TEMPORARY";
  else mapped = "UNKNOWN";

  const suffix = rc !== undefined ? ` (${rc})` : "";
  return { code: mapped, message: MESSAGES[mapped] + suffix, permanent: PERMANENT.has(mapped) };
}

/** Error carrying the `CONFIG` class, thrown when no usable SMTP configuration exists. */
export function configError(): Error & { code: string } {
  return Object.assign(new Error(MESSAGES.CONFIG), { code: "ECONFIG" });
}

/** `a***@d.com` for logs, audit and the result panel. */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf("@");
  if (at <= 0) return "***";
  return `${email[0]}***${email.slice(at)}`;
}

export function maskUser(user: string): string {
  if (!user) return "";
  return user.includes("@") ? maskEmail(user) : `${user[0]}***`;
}
