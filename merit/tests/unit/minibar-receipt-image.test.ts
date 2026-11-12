import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { normalizeReceiptImage } from "@/modules/minibar/server/receiptOcr";

const blank = (width: number, height: number) =>
  sharp({ create: { width, height, channels: 3, background: "#ffffff" } });

describe("evrak görseli normalleştirme", () => {
  it("büyük fotoğrafı sınırlı boyutta JPEG olarak yeniden kodlar", async () => {
    const out = await normalizeReceiptImage(await blank(5000, 3000).png().toBuffer());
    const meta = await sharp(out).metadata();
    expect(meta.format).toBe("jpeg");
    expect(Math.max(meta.width ?? 0, meta.height ?? 0)).toBe(2600);
  });

  it("küçük görseli büyütmez", async () => {
    const meta = await sharp(await normalizeReceiptImage(await blank(800, 600).jpeg().toBuffer())).metadata();
    expect([meta.width, meta.height]).toEqual([800, 600]);
  });

  it("piksel sınırını aşan görseli (dosyası küçük olsa da) reddeder", async () => {
    const huge = await blank(9000, 5000).png({ compressionLevel: 9 }).toBuffer();
    expect(huge.length).toBeLessThan(8 * 1024 * 1024);
    await expect(normalizeReceiptImage(huge)).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("görsel olmayan veriyi reddeder", async () => {
    await expect(normalizeReceiptImage(Buffer.from([0xff, 0xd8, 0xff, 1, 2, 3]))).rejects.toMatchObject({ code: "VALIDATION" });
  });
});
