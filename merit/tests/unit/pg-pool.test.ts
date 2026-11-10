import { describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ PrismaPg: vi.fn(function (this: object, options: unknown) { Object.assign(this, { options }); }) }));
vi.mock("@prisma/adapter-pg", () => mock);
import { envSchema } from "@/lib/env";
import { pgAdapter } from "@/lib/pgAdapter";

describe("DB havuz sınırları", () => {
  it("varsayılan 20, sınırlar 5..100", () => {
    const base = { DATABASE_URL: "postgresql://localhost/test", SESSION_SECRET: "x".repeat(32), QR_HMAC_SECRET: "y".repeat(32), APP_BASE_URL: "http://localhost:3124", PRINT_GATEWAY_KEY: "z".repeat(32) };
    expect(envSchema.parse(base).DB_POOL_MAX).toBe(20);
    for (const n of [4, 101]) expect(envSchema.safeParse({ ...base, DB_POOL_MAX: n }).success).toBe(false);
  });
  it("adapter UTC, timeout ve havuz sınırını uygular", () => {
    pgAdapter("postgresql://localhost/merit_test");
    expect(mock.PrismaPg).toHaveBeenCalledWith(expect.objectContaining({ max: 20, connectionTimeoutMillis: 5000, idleTimeoutMillis: 30000, options: "-c TimeZone=UTC" }));
  });
});
