import { z } from "zod";

/**
 * Secrets have NO defaults: a missing value must stop the process at startup.
 * `APP_BASE_URL` falls back to localhost only outside production (dev/test).
 */
/**
 * A blank value means "not set". docker-compose passes optional variables as `${VAR:-}`, i.e. an empty
 * string, which would otherwise fail `.min(1)` / `.regex()` on optional keys and skip `.default()`.
 */
function dropBlank(input: unknown): unknown {
  if (typeof input !== "object" || input === null) return input;
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => typeof value !== "string" || value.trim() !== ""),
  );
}

export const envSchema = z.preprocess(dropBlank, z.object({
  VAPID_PUBLIC_KEY: z.string().min(1).optional(),
  VAPID_PRIVATE_KEY: z.string().min(1).optional(),
  VAPID_SUBJECT: z.string().regex(/^(mailto:|https:\/\/)/).optional(),
  /** Virgülle ayrılmış izinli Web Push ana makineleri (varsayılan: bilinen push servisleri). */
  PUSH_ENDPOINT_ALLOWLIST: z.string().optional(),
  TRANSLATE_PROVIDER: z.enum(["none", "gtx"]).default("none"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL tanımlı olmalı"),
  DB_POOL_MAX: z.coerce.number().int().min(5).max(100).default(20),
  SESSION_SECRET: z.string().min(32, "SESSION_SECRET en az 32 karakter olmalı"),
  QR_HMAC_SECRET: z.string().min(32, "QR_HMAC_SECRET en az 32 karakter olmalı"),
  /** Anahtar kutusu (SMTP parolası) için ayrı anahtar; boşsa SESSION_SECRET kullanılır. Değişirse mühürlü değerler açılamaz. */
  SETTINGS_SECRET_KEY: z.string().min(32, "SETTINGS_SECRET_KEY en az 32 karakter olmalı").optional(),
  APP_BASE_URL: z.url("APP_BASE_URL geçerli bir URL olmalı"),
  PRINT_GATEWAY_KEY: z.string().min(32, "PRINT_GATEWAY_KEY en az 32 karakter olmalı"),
  /** Docker entrypoint: "true" runs prisma/seed.ts at startup (requires SEED_ADMIN_PASSWORD). */
  RUN_SEED: z.string().optional(),
  SEED_ADMIN_PASSWORD: z.string().optional(),
  /** Where uploaded files (menu images) live; defaults to <cwd>/uploads. */
  UPLOADS_DIR: z.string().min(1).optional(),
  /** Trusted reverse proxies in front of the app; the client IP is the Nth `x-forwarded-for` entry from the right. */
  /** Kısa ortam etiketi (ör. EĞİTİM); doluysa durum çubuklarında rozet çizilir. Üretimde boş bırakılır. */
  ENV_LABEL: z.string().trim().max(20).optional(),
  TRUSTED_PROXY_HOPS: z.coerce.number().int().min(1).default(1),
}).refine(
  (value) => Boolean(value.VAPID_PUBLIC_KEY) === Boolean(value.VAPID_PRIVATE_KEY),
  { message: "VAPID_PUBLIC_KEY ve VAPID_PRIVATE_KEY birlikte tanımlanmalı", path: ["VAPID_PUBLIC_KEY"] },
).refine(
  // Same minimum as prisma/seed.ts: an entrypoint seed without the password must stop at startup.
  (value) => value.RUN_SEED !== "true" || (value.SEED_ADMIN_PASSWORD ?? "").length >= 10,
  { message: "RUN_SEED=true iken SEED_ADMIN_PASSWORD en az 10 karakter olarak tanımlanmalı", path: ["SEED_ADMIN_PASSWORD"] },
));

export type Env = z.infer<typeof envSchema>;

function load(): Env {
  // Docker builder stage only (`next build` imports modules without runtime secrets). Never set at runtime.
  if (process.env.SKIP_ENV_VALIDATION === "1") {
    return {
      ...process.env,
      TRANSLATE_PROVIDER: process.env.TRANSLATE_PROVIDER ?? "none",
      TRUSTED_PROXY_HOPS: Number(process.env.TRUSTED_PROXY_HOPS) || 1,
      DB_POOL_MAX: Number(process.env.DB_POOL_MAX) || 20,
    } as unknown as Env;
  }
  const raw = { ...process.env };
  if (!raw.APP_BASE_URL && process.env.NODE_ENV !== "production") raw.APP_BASE_URL = "http://localhost:3000";
  return envSchema.parse(raw);
}

export const env: Env = load();
