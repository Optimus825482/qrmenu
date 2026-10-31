import iconv from "iconv-lite";
import { describe, expect, it } from "vitest";
import { encodeReceipt } from "../src/escpos.js";

describe("encodeReceipt", () => {
  it("buffer 1B 40 (ESC @) ile başlar", () => {
    const buf = encodeReceipt(["Test"], { codepage: "cp857", title: "Test" });
    expect([buf[0], buf[1]]).toEqual([0x1b, 0x40]);
  });

  it("buffer 1D 56 00 (GS V 0, tam kesim) ile biter", () => {
    const buf = encodeReceipt(["Test"], { codepage: "cp857", title: "Test" });
    const tail = buf.subarray(buf.length - 3);
    expect([...tail]).toEqual([0x1d, 0x56, 0x00]);
  });

  it("varsayılan kod sayfası tablosu 13 ile ESC t 13 yazar", () => {
    const buf = encodeReceipt(["Test"], { codepage: "cp857", title: "Test" });
    expect([buf[2], buf[3], buf[4]]).toEqual([0x1b, 0x74, 13]);
  });

  it("'Şiş köfte' satırı cp857 encode'da '?' (0x3F) baytı içermez", () => {
    const text = "Şiş köfte";
    const buf = encodeReceipt([text], { codepage: "cp857", title: "MERIT OS" });
    const expectedBytes = iconv.encode(text, "cp857");
    // Satır doğru kod sayfasıyla kodlanmış olmalı (yanlış kod sayfası Türkçe
    // karakterleri '?' yapardı ve bu dizi buffer'da bulunamazdı).
    const at = buf.indexOf(expectedBytes);
    expect(at).toBeGreaterThanOrEqual(0);
    const lineBytes = buf.subarray(at, at + expectedBytes.length);
    expect(lineBytes.includes(0x3f)).toBe(false);
  });

  it("encode edilen baytları iconv.decode(..., 'cp857') ile geri aynı metni verir", () => {
    const text = "Şiş köfte";
    const buf = encodeReceipt([text], { codepage: "cp857", title: "MERIT OS" });
    const expectedBytes = iconv.encode(text, "cp857");
    const at = buf.indexOf(expectedBytes);
    const lineBytes = buf.subarray(at, at + expectedBytes.length);
    expect(iconv.decode(lineBytes, "cp857")).toBe(text);
  });

  it("başlığı çift boy ve ortalanmış blok olarak, gövde satırlarını normal boyda yazar", () => {
    const buf = encodeReceipt(["Kalem ×1"], { codepage: "cp857", title: "MERIT · HAVUZ BAR" });
    // ESC @ | ESC t 13 | GS ! 0x11 | ESC a 1 | <title> | \n | GS ! 0x00 | ESC a 0 | <lines>
    expect([buf[5], buf[6], buf[7]]).toEqual([0x1d, 0x21, 0x11]);
    expect([buf[8], buf[9], buf[10]]).toEqual([0x1b, 0x61, 0x01]);
    const titleBytes = iconv.encode("MERIT · HAVUZ BAR", "cp857");
    expect(buf.indexOf(titleBytes)).toBe(11);
    // Başlıktan sonra normal boy/orta komutları gelir:
    const afterTitle = 11 + titleBytes.length + 1; // + \n
    expect([buf[afterTitle], buf[afterTitle + 1], buf[afterTitle + 2]]).toEqual([0x1d, 0x21, 0x00]);
    expect([buf[afterTitle + 3], buf[afterTitle + 4], buf[afterTitle + 5]]).toEqual([
      0x1b, 0x61, 0x00,
    ]);
  });

  it("kesimden önce 4 boş satır (0A) bırakır", () => {
    const buf = encodeReceipt(["Kalem ×1"], { codepage: "cp857", title: "T" });
    const cutAt = buf.length - 3;
    expect([...buf.subarray(cutAt - 4, cutAt)]).toEqual([0x0a, 0x0a, 0x0a, 0x0a]);
  });
});
