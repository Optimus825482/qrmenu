import { describe, expect, it } from "vitest";
import { targetSchema } from "../src/targets";
const base = { baseUrl: "http://localhost:3124", tables: [{ token: "token", outletId: "outlet", menuNodeId: "item" }], rooms: [{ token: "room", menuNodeId: "item" }], staff: [{ username: "yuk.kasa1", role: "kasa" }] };
describe("parolasız hedef dosyası", () => {
  it("hedefleri doğrular, bilinmeyen/parola alanını reddeder", () => {
    expect(targetSchema.safeParse(base).success).toBe(true);
    expect(targetSchema.safeParse({ ...base, password: "secret" }).success).toBe(false);
    expect(targetSchema.safeParse({ ...base, staff: [{ ...base.staff[0], password: "secret" }] }).success).toBe(false);
  });
});
