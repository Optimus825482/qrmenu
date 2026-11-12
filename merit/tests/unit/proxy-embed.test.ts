import { describe, expect, it } from "vitest";
import { embedCarryUrl } from "@/proxy";

const ORIGIN = "https://example.test";
const framed = `${ORIGIN}/depo/doluluk-yukle?font=tahoma&theme=mavi`;
const carry = (over: Partial<Parameters<typeof embedCarryUrl>[0]> = {}) =>
  embedCarryUrl({ method: "GET", url: `${ORIGIN}/kat/tavsiye-is-plani`, referer: framed, fetchDest: "iframe", ...over });

describe("pencere içindeki sayfadan izlenen bağlantı", () => {
  it("pencere işaretini yeni adrese taşır (belge yüklemesi ve yönlendirici isteği)", () => {
    expect(carry()).toBe(`${ORIGIN}/kat/tavsiye-is-plani?font=tahoma&theme=mavi`);
    expect(carry({ fetchDest: "empty", url: `${ORIGIN}/kat/tavsiye-is-plani?_rsc=abc` })).toBe(
      `${ORIGIN}/kat/tavsiye-is-plani?_rsc=abc&font=tahoma&theme=mavi`,
    );
    expect(carry({ url: `${ORIGIN}/depo/stok?hotelId=h1` })).toBe(`${ORIGIN}/depo/stok?hotelId=h1&font=tahoma&theme=mavi`);
  });

  it("işaret zaten varsa, kaynak pencere içinde değilse ya da sekmenin tamamı değişiyorsa dokunmaz", () => {
    expect(carry({ url: `${ORIGIN}/kat?font=verdana&theme=gumus` })).toBeNull();
    expect(carry({ referer: `${ORIGIN}/depo/doluluk-yukle` })).toBeNull();
    expect(carry({ referer: null })).toBeNull();
    expect(carry({ fetchDest: "document" })).toBeNull();
    expect(carry({ fetchDest: null })).toBeNull();
    expect(carry({ method: "POST" })).toBeNull();
    expect(carry({ referer: "https://baska.test/x?font=tahoma&theme=mavi" })).toBeNull();
    expect(carry({ referer: "bozuk" })).toBeNull();
  });
});

describe("pencerenin seçili oteli", () => {
  const premium = `${ORIGIN}/kat/doluluk/f1?font=tahoma&theme=mavi&hotelId=premium`;

  it("kat listesine dönüşte ve sonraki her sayfada taşınır; otel seçicinin gösterdiği otel değişmez", () => {
    expect(carry({ referer: premium, url: `${ORIGIN}/kat` })).toBe(`${ORIGIN}/kat?font=tahoma&theme=mavi&hotelId=premium`);
    // The mark is already there (a second hop): the hotel alone is still carried.
    expect(carry({ referer: premium, url: `${ORIGIN}/kat?font=tahoma&theme=mavi` })).toBe(
      `${ORIGIN}/kat?font=tahoma&theme=mavi&hotelId=premium`,
    );
    expect(carry({ referer: premium, fetchDest: "empty", url: `${ORIGIN}/kat/manuel-kayit?oda=r1&_rsc=x` })).toBe(
      `${ORIGIN}/kat/manuel-kayit?oda=r1&_rsc=x&font=tahoma&theme=mavi&hotelId=premium`,
    );
  });

  it("kendi otelini söyleyen adres ve oteli olmayan pencere olduğu gibi kalır", () => {
    expect(carry({ referer: premium, url: `${ORIGIN}/depo/stok?hotelId=diamond` })).toBe(
      `${ORIGIN}/depo/stok?hotelId=diamond&font=tahoma&theme=mavi`,
    );
    expect(carry({ referer: premium, url: `${ORIGIN}/kat?font=tahoma&theme=mavi&hotelId=diamond` })).toBeNull();
    expect(carry({ url: `${ORIGIN}/kat?font=tahoma&theme=mavi` })).toBeNull();
  });
});
