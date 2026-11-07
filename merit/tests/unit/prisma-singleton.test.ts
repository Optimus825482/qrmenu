import { afterEach, describe, expect, it, vi } from "vitest";
const fake = vi.hoisted(() => ({ create: vi.fn(function () { return { synthetic: true }; }) }));
vi.mock("@/generated/prisma/client", () => ({ PrismaClient: fake.create }));
vi.mock("@/lib/env", () => ({ env: { DATABASE_URL: "postgresql://localhost/merit_test", DB_POOL_MAX: 20 } }));
vi.mock("@/lib/pgAdapter", () => ({ pgAdapter: () => ({}) }));
afterEach(() => { delete globalThis.__prisma; vi.unstubAllEnvs(); });
describe("üretim Prisma havuzu tekilliği", () => {
  it("ayrı sunucu modülü yüklemeleri aynı global istemciyi kullanır", async () => {
    vi.stubEnv("NODE_ENV", "production"); delete globalThis.__prisma; fake.create.mockClear();
    vi.resetModules(); const a = await import("@/lib/prisma");
    vi.resetModules(); const b = await import("@/lib/prisma");
    expect(a.prisma).toBe(b.prisma);
    expect(fake.create).toHaveBeenCalledTimes(1);
  });
});
