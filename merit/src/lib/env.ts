import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  SESSION_SECRET: z.string().min(32, "SESSION_SECRET en az 32 karakter olmalı"),
  QR_HMAC_SECRET: z.string().min(32, "QR_HMAC_SECRET en az 32 karakter olmalı"),
  APP_BASE_URL: z.url(),
  PRINT_GATEWAY_KEY: z.string().min(1),
  /** Where uploaded files (menu images) live; defaults to <cwd>/uploads. */
  UPLOADS_DIR: z.string().min(1).optional(),
  /** Trusted reverse proxies in front of the app; the client IP is the Nth `x-forwarded-for` entry from the right. */
  TRUSTED_PROXY_HOPS: z.coerce.number().int().min(1).default(1),
});

export type Env = z.infer<typeof schema>;

export const env: Env = schema.parse(process.env);
