import { describe, expect, it } from "vitest";
import { managedPort } from "../src/server";
describe("yönetilen sunucu sahipliği", () => {
  it("yalnız ayrılmış yerel HTTP portu", () => {
    expect(managedPort("http://localhost:3124")).toBe(3124);
    for (const url of ["http://localhost:3000", "http://localhost:3001", "http://localhost:3010", "https://localhost:3124", "http://merit.example:3124", "http://localhost:80"]) expect(() => managedPort(url)).toThrow();
  });
});
