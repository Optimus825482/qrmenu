import { describe, expect, it } from "vitest";
import { envSchema } from "@/lib/env";

const base = {
  DATABASE_URL: "postgresql://localhost/test",
  SESSION_SECRET: "x".repeat(32),
  QR_HMAC_SECRET: "y".repeat(32),
  APP_BASE_URL: "http://localhost:3124",
  PRINT_GATEWAY_KEY: "z".repeat(32),
};

describe("envSchema", () => {
  it("PRINT_GATEWAY_KEY en az 32 karakter olmalı", () => {
    expect(envSchema.safeParse(base).success).toBe(true);
    const short = envSchema.safeParse({ ...base, PRINT_GATEWAY_KEY: "z".repeat(31) });
    expect(short.success).toBe(false);
    expect(short.error?.issues[0]?.message).toMatch(/PRINT_GATEWAY_KEY en az 32/);
  });

  it("RUN_SEED=true iken SEED_ADMIN_PASSWORD (en az 10 karakter) zorunlu", () => {
    for (const SEED_ADMIN_PASSWORD of [undefined, "kisa"]) {
      const result = envSchema.safeParse({ ...base, RUN_SEED: "true", SEED_ADMIN_PASSWORD });
      expect(result.success).toBe(false);
      expect(result.error?.issues[0]?.path).toEqual(["SEED_ADMIN_PASSWORD"]);
    }
    expect(envSchema.safeParse({ ...base, RUN_SEED: "true", SEED_ADMIN_PASSWORD: "Uzun-Parola-1" }).success).toBe(true);
    expect(envSchema.safeParse({ ...base, RUN_SEED: "false" }).success).toBe(true);
    expect(envSchema.safeParse(base).success).toBe(true);
  });
});
