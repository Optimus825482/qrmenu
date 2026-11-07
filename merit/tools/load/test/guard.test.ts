import { afterEach, describe, expect, it } from "vitest";
import { assertSafeTarget } from "../src/guard";
afterEach(() => delete process.env.LOAD_ALLOW_HOST);
describe("yük hedefi koruması", () => {
  it("uzak hedef, üretim DB, kullanıcı bilgili URL ve eksik DB reddeder", () => {
    for (const [base, db] of [["https://merit.otel.example", "postgresql://localhost/merit_load"], ["http://localhost:3124", "postgresql://localhost/merit"], ["http://user:pass@localhost:3124", "postgresql://localhost/merit_load"], ["http://localhost:3124", undefined]]) expect(() => assertSafeTarget(base!, db)).toThrow("Güvenli olmayan hedef");
  });
  it("yerel hostlar ve tam izinli host kabul", () => {
    for (const host of ["localhost", "127.0.0.1", "[::1]"]) expect(() => assertSafeTarget(`http://${host}:3124`, "postgresql://localhost/merit_load")).not.toThrow();
    process.env.LOAD_ALLOW_HOST = "merit.otel.example";
    expect(() => assertSafeTarget("https://merit.otel.example", "postgresql://localhost/merit_test")).not.toThrow();
    expect(() => assertSafeTarget("https://merit.otel.example.evil", "postgresql://localhost/merit_test")).toThrow();
  });
});
