import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { dropReferenceData, resetReferenceData } from "../helpers/fixtures";
import { testDb } from "../helpers/db";
import {
  generateQrToken,
  isSignedToken,
  qrUrl,
  renderQrPng,
  renderQrSvg,
  verifyQrToken,
} from "@/lib/qr";

describe("QR token (imzalı, 30 karakter)", () => {
  it("generateQrToken 30 karakterlik base64url üretir ve her seferinde farklıdır", () => {
    const a = generateQrToken("TABLE", "t1");
    expect(a).toHaveLength(30);
    expect(a).toMatch(/^[A-Za-z0-9_-]{30}$/);
    expect(generateQrToken("TABLE", "t1")).not.toBe(a);
  });

  it("verifyQrToken doğru tür ve varlıkla true, yanlış tür/varlıkla false", () => {
    const tok = generateQrToken("TABLE", "t1");
    expect(verifyQrToken(tok, "TABLE", "t1")).toBe(true);
    expect(verifyQrToken(tok, "ROOM", "t1")).toBe(false);
    expect(verifyQrToken(tok, "TABLE", "t2")).toBe(false);
  });

  it("bir karakter değişince doğrulama başarısız olur", () => {
    const tok = generateQrToken("ROOM", "r1");
    for (const i of [0, 21, 22, 29]) {
      const flipped = tok.slice(0, i) + (tok[i] === "A" ? "B" : "A") + tok.slice(i + 1);
      expect(verifyQrToken(flipped, "ROOM", "r1")).toBe(false);
    }
  });

  it("6 haneli oda kodu ve yanlış uzunluk imzalı sayılmaz", () => {
    expect(verifyQrToken("123456", "TABLE", "t1")).toBe(false);
    expect(isSignedToken("123456")).toBe(false);
    expect(isSignedToken(generateQrToken("TABLE", "t1"))).toBe(true);
    expect(isSignedToken("x".repeat(31))).toBe(false);
    expect(isSignedToken("a b".padEnd(30, "c"))).toBe(false);
  });

  it("renderQrSvg <svg ile başlar, renderQrPng PNG imzası taşır", async () => {
    const svg = await renderQrSvg("http://localhost:3000/q/abc");
    expect(svg.trimStart().startsWith("<svg")).toBe(true);
    const png = await renderQrPng("http://localhost:3000/q/abc");
    expect(png.subarray(0, 4).toString("hex")).toBe("89504e47");
  });
});

describe("qrUrl (gerçek test DB)", () => {
  beforeAll(resetReferenceData);
  afterAll(async () => {
    await dropReferenceData();
    await testDb.$disconnect();
  });

  it("qr.baseUrl ayarından /q/<token> üretir", async () => {
    expect(await qrUrl("tok123")).toBe("http://localhost:3000/q/tok123");
  });
});
