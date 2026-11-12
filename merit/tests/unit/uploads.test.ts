import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "merit-uploads-"));
process.env.UPLOADS_DIR = dir;

const { UPLOADS_ROOT, readUpload, removeUpload, saveUpload } = await import("@/lib/uploads");
const { GET } = await import("@/app/uploads/[...path]/route");

const ctx = (...segments: string[]) => ({ params: Promise.resolve({ path: segments }) });
const req = (p: string) => new Request(`http://localhost/uploads/${p}`);

describe("uploads", () => {
  beforeAll(() => {
    expect(UPLOADS_ROOT).toBe(dir);
  });
  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

  it("saveUpload dizini oluşturur ve dosyayı yazar", async () => {
    await saveUpload("menu/o1/a.webp", Buffer.from("abc"));
    expect(fs.existsSync(path.join(dir, "menu", "o1", "a.webp"))).toBe(true);
  });

  it("'..' içeren yol VALIDATION ile reddedilir (save/read/remove)", async () => {
    await expect(saveUpload("../x", Buffer.from("1"))).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(saveUpload("menu/../../x.webp", Buffer.from("1"))).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(readUpload("../x")).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(removeUpload("../x")).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("readUpload içerik ve içerik türünü döner; yoksa null", async () => {
    await saveUpload("menu/o1/b.webp", Buffer.from("hello"));
    const got = await readUpload("menu/o1/b.webp");
    expect(got?.data.toString()).toBe("hello");
    expect(got?.contentType).toBe("image/webp");
    expect(await readUpload("menu/o1/yok.webp")).toBeNull();
  });

  it("removeUpload dosyayı siler ve olmayan dosyada hata vermez", async () => {
    await saveUpload("menu/o1/c.png", Buffer.from("x"));
    await removeUpload("menu/o1/c.png");
    expect(await readUpload("menu/o1/c.png")).toBeNull();
    await expect(removeUpload("menu/o1/c.png")).resolves.toBeUndefined();
  });

  it("GET route: webp 200 + değişmez önbellek başlığı; bilinmeyen uzantı ve eksik dosya 404", async () => {
    await saveUpload("menu/o1/d.webp", Buffer.from("img"));
    const ok = await GET(req("menu/o1/d.webp"), ctx("menu", "o1", "d.webp"));
    expect(ok.status).toBe(200);
    expect(ok.headers.get("content-type")).toBe("image/webp");
    expect(ok.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    expect(Buffer.from(await ok.arrayBuffer()).toString()).toBe("img");

    await saveUpload("menu/o1/e.txt", Buffer.from("t"));
    expect((await GET(req("menu/o1/e.txt"), ctx("menu", "o1", "e.txt"))).status).toBe(404);
    expect((await GET(req("menu/o1/yok.webp"), ctx("menu", "o1", "yok.webp"))).status).toBe(404);
    expect((await GET(req("x"), ctx("..", "x.webp"))).status).toBe(404);
    expect(ok.headers.get("content-security-policy")).toBeNull();
  });

  it("GET route: svg yanıtı sandbox CSP taşır", async () => {
    await saveUpload("hotel/logo.svg", Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>"));
    const res = await GET(req("hotel/logo.svg"), ctx("hotel", "logo.svg"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/svg+xml");
    expect(res.headers.get("content-security-policy")).toBe("default-src 'none'; style-src 'unsafe-inline'; sandbox");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
  });

  it("yol geçişi: ters eğik çizgi, mutlak yol, sürücü harfi ve NUL VALIDATION ile reddedilir", async () => {
    for (const bad of ["..\\x", "a\\..\\x.webp", "/etc/x", "C:\\x", "c:/x.webp", "a\0b.webp"]) {
      await expect(readUpload(bad)).rejects.toMatchObject({ code: "VALIDATION" });
      await expect(saveUpload(bad, Buffer.from("1"))).rejects.toMatchObject({ code: "VALIDATION" });
      await expect(removeUpload(bad)).rejects.toMatchObject({ code: "VALIDATION" });
    }
  });

  it("evrak görselleri (receipts/) herkese açık yoldan verilmez", async () => {
    await saveUpload("receipts/aabbccddeeff001122334455.jpg", Buffer.from("gizli"));
    expect((await GET(req("x"), ctx("receipts", "aabbccddeeff001122334455.jpg"))).status).toBe(404);
    expect((await GET(req("x"), ctx("Receipts", "aabbccddeeff001122334455.jpg"))).status).toBe(404);
    expect((await GET(req("x"), ctx("receipts\aabbccddeeff001122334455.jpg"))).status).toBe(404);
    // The authenticated route still reads it through readUpload.
    expect((await readUpload("receipts/aabbccddeeff001122334455.jpg"))?.data.toString()).toBe("gizli");
  });

  it("yol geçişi: route kötü yolları 404 yapar; çözülmüş '%2e%2e' parçası kök dışına çıkamaz", async () => {
    expect((await GET(req("x"), ctx("..\\x.webp"))).status).toBe(404);
    expect((await GET(req("x"), ctx("", "etc", "x.webp"))).status).toBe(404);
    expect((await GET(req("x"), ctx("C:\\x.webp"))).status).toBe(404);
    expect((await GET(req("x"), ctx("a\0b.webp"))).status).toBe(404);
    expect((await GET(req("x"), ctx("%2e%2e", "x.webp"))).status).toBe(404);
    expect(fs.existsSync(path.join(path.dirname(dir), "x.webp"))).toBe(false);
  });
});
