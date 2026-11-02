import { z } from "zod";

/**
 * Secrets have NO defaults: a missing value must stop the process at startup.
 * `APP_BASE_URL` falls back to localhost only outside production (dev/test).
 */
const schema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL tanımlı olmalı"),
  SESSION_SECRET: z.string().min(32, "SESSION_SECRET en az 32 karakter olmalı"),
  QR_HMAC_SECRET: z.string().min(32, "QR_HMAC_SECRET en az 32 karakter olmalı"),
  APP_BASE_URL: z.url("APP_BASE_URL geçerli bir URL olmalı"),
  PRINT_GATEWAY_KEY: z.string().min(1, "PRINT_GATEWAY_KEY tanımlı olmalı"),
  /** Where uploaded files (menu images) live; defaults to <cwd>/uploads. */
  UPLOADS_DIR: z.string().min(1).optional(),
  /** Trusted reverse proxies in front of the app; the client IP is the Nth `x-forwarded-for` entry from the right. */
  TRUSTED_PROXY_HOPS: z.coerce.number().int().min(1).default(1),
});

export type Env = z.infer<typeof schema>;

function load(): Env {
  // Docker builder stage only (`next build` imports modules without runtime secrets). Never set at runtime.
  if (process.env.SKIP_ENV_VALIDATION === "1") {
    return {
      ...process.env,
      TRUSTED_PROXY_HOPS: Number(process.env.TRUSTED_PROXY_HOPS) || 1,
    } as unknown as Env;
  }
  const raw = { ...process.env };
  if (!raw.APP_BASE_URL && process.env.NODE_ENV !== "production") raw.APP_BASE_URL = "http://localhost:3000";
  return schema.parse(raw);
}

export const env: Env = load();
