import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { writeHotelLogo } from "../../scripts/extract-logo-file";

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(16, 1)]);
const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(16, 2)]);
const dirs: string[] = [];
const tmp = () => {
  const d = mkdtempSync(path.join(tmpdir(), "logo-"));
  dirs.push(d);
  return d;
};
afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })));

describe("eski logo çıkarımı", () => {
  it("SVG data-URI reddedilir ve dosya yazılmaz", () => {
    const dir = tmp();
    const svg = `data:image/svg+xml;base64,${Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'><script>1</script></svg>").toString("base64")}`;
    expect(writeHotelLogo(dir, "ROYAL", svg)).toBeNull();
    expect(readdirSync(dir)).toEqual([]);
    // an SVG disguised under a png media type is rejected as well (content decides)
    const fake = `data:image/png;base64,${Buffer.from("<svg></svg>").toString("base64")}`;
    expect(writeHotelLogo(dir, "ROYAL", fake)).toBeNull();
    expect(readdirSync(dir)).toEqual([]);
  });

  it("PNG kabul edilir; uzantı bayt imzasından gelir (jpeg tipi yalan söylese de)", () => {
    const dir = tmp();
    expect(writeHotelLogo(dir, "ROYAL", `data:image/jpeg;base64,${PNG.toString("base64")}`)).toBe("/brand/hotels/royal.png");
    expect(readdirSync(dir)).toEqual(["royal.png"]);
  });

  it("yeniden çıkarımda farklı uzantılı eski dosya silinir", () => {
    const dir = tmp();
    writeFileSync(path.join(dir, "royal.svg"), "<svg/>");
    writeFileSync(path.join(dir, "royal.png"), PNG);
    expect(writeHotelLogo(dir, "ROYAL", JPG.toString("base64"))).toBe("/brand/hotels/royal.jpg");
    expect(readdirSync(dir)).toEqual(["royal.jpg"]);
    expect(writeHotelLogo(dir, "ROYAL", "")).toBeNull();
    expect(existsSync(path.join(dir, "royal.jpg"))).toBe(false);
  });
});
