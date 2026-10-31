import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { testDb } from "../helpers/db";
import {
  ctxFor,
  dropReferenceData,
  hotelId,
  makeUser,
  resetReferenceData,
  resetTestData,
} from "../helpers/fixtures";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "merit-menu-img-"));
process.env.UPLOADS_DIR = dir;

vi.mock("@/lib/prisma", async () => ({ prisma: (await import("../helpers/db")).testDb }));
const publishMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/realtime", () => ({ publish: publishMock }));

const tree = await import("@/modules/menu/server/menuTree");
const images = await import("@/modules/menu/server/menuImages");

beforeAll(resetReferenceData);
beforeEach(async () => {
  await testDb.menuNode.deleteMany({});
  await resetTestData();
  await testDb.auditLog.deleteMany({});
  publishMock.mockReset();
});
afterAll(async () => {
  await testDb.menuNode.deleteMany({});
  await dropReferenceData();
  await testDb.$disconnect();
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    // Windows may still hold a handle on a just-read image; the OS temp dir is cleaned up anyway.
  }
});

async function setup() {
  const user = await makeUser({ username: "fbm", roleCode: "R-FBM", hotelCode: "MR" });
  const ctx = await ctxFor(user, { hotelCode: "MR" });
  const o = await testDb.outlet.create({
    data: { hotelId: await hotelId("MR"), name: "Havuz Bar", type: "BAR", hasMenu: true },
  });
  const cat = await tree.create(ctx, o.id, { kind: "KATEGORI", name: "İçecekler" });
  return { ctx, o, cat };
}

const png = (color: string) =>
  sharp({ create: { width: 100, height: 100, channels: 3, background: color } }).png().toBuffer();

const file = (bytes: Buffer, type = "image/png") => ({ name: "a.png", type, size: bytes.length, bytes });

describe("menuImages", () => {
  it("PNG → webp dosyası, imageUrl /uploads/menu/…webp, audit ve menu.changed", async () => {
    const { ctx, o, cat } = await setup();
    const { imageUrl } = await images.upload(ctx, cat.id, file(await png("#ff0000")));
    expect(imageUrl).toMatch(new RegExp(`^/uploads/menu/${o.id}/${cat.id}-[0-9a-f]{16}\\.webp$`));
    const disk = path.join(dir, imageUrl.slice("/uploads/".length));
    expect(fs.existsSync(disk)).toBe(true);
    expect((await sharp(disk).metadata()).format).toBe("webp");
    expect((await testDb.menuNode.findUniqueOrThrow({ where: { id: cat.id } })).imageUrl).toBe(imageUrl);
    expect(await testDb.auditLog.count({ where: { action: "MENU_IMAGE_SET" } })).toBe(1);
    expect(publishMock).toHaveBeenCalledWith(
      expect.objectContaining({ type: "menu.changed", outletId: o.id }),
      expect.anything(),
    );
  });

  it("2 MB + 1 bayt VALIDATION; text/plain VALIDATION", async () => {
    const { ctx, cat } = await setup();
    await expect(
      images.upload(ctx, cat.id, file(Buffer.alloc(2 * 1024 * 1024 + 1))),
    ).rejects.toMatchObject({ code: "VALIDATION", message: "Görsel 2 MB'ı aşamaz" });
    await expect(
      images.upload(ctx, cat.id, file(Buffer.from("merhaba"), "text/plain")),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(images.upload(ctx, cat.id, file(Buffer.from("png değil")))).rejects.toMatchObject({
      code: "VALIDATION",
    });
  });

  it("ikinci yüklemede eski dosya silinir; remove görseli kaldırır", async () => {
    const { ctx, cat } = await setup();
    const first = await images.upload(ctx, cat.id, file(await png("#ff0000")));
    const second = await images.upload(ctx, cat.id, file(await png("#00ff00")));
    expect(second.imageUrl).not.toBe(first.imageUrl);
    expect(fs.existsSync(path.join(dir, first.imageUrl.slice(9)))).toBe(false);
    expect(fs.existsSync(path.join(dir, second.imageUrl.slice(9)))).toBe(true);
    await images.remove(ctx, cat.id);
    expect(fs.existsSync(path.join(dir, second.imageUrl.slice(9)))).toBe(false);
    expect((await testDb.menuNode.findUniqueOrThrow({ where: { id: cat.id } })).imageUrl).toBeNull();
    expect(await testDb.auditLog.count({ where: { action: "MENU_IMAGE_REMOVE" } })).toBe(1);
  });

  const listFiles = (d: string): string[] =>
    fs.existsSync(d)
      ? fs.readdirSync(d, { withFileTypes: true }).flatMap((e) =>
          e.isDirectory() ? listFiles(path.join(d, e.name)) : [path.join(d, e.name)],
        )
      : [];

  it("yetkisiz (R-GAR, QM-MEN D yok) FORBIDDEN ve diske hiçbir dosya yazılmaz", async () => {
    const { cat } = await setup();
    const user = await makeUser({ username: "gar", roleCode: "R-GAR", hotelCode: "MR" });
    const gar = await ctxFor(user, { hotelCode: "MR" });
    const before = listFiles(dir);
    await expect(images.upload(gar, cat.id, file(await png("#0000ff")))).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(listFiles(dir)).toEqual(before);
    expect((await testDb.menuNode.findUniqueOrThrow({ where: { id: cat.id } })).imageUrl).toBeNull();
  });

  it("outlet kapsamlı oturum başka outletin öğesine yükleyemez; dosya yazılmaz", async () => {
    const { ctx, cat } = await setup();
    const other = await testDb.outlet.create({
      data: { hotelId: await hotelId("MR"), name: "Lobi Bar", type: "BAR", hasMenu: true },
    });
    const scoped = { ...ctx, session: { ...ctx.session, outletId: other.id } };
    const before = listFiles(dir);
    await expect(images.upload(scoped, cat.id, file(await png("#0000ff")))).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(listFiles(dir)).toEqual(before);
  });

  it("MIME image/png ama gerçek biçim GIF/metin → VALIDATION", async () => {
    const { ctx, cat } = await setup();
    const gif = await sharp({ create: { width: 10, height: 10, channels: 3, background: "#fff" } })
      .gif()
      .toBuffer();
    await expect(images.upload(ctx, cat.id, file(gif, "image/png"))).rejects.toMatchObject({
      code: "VALIDATION",
    });
    await expect(images.upload(ctx, cat.id, file(Buffer.from("<svg/>"), "image/png"))).rejects.toMatchObject({
      code: "VALIDATION",
    });
  });

  it("aynı içerik tekrar yüklenince aynı dosya yeniden kullanılır ve silinmez", async () => {
    const { ctx, cat } = await setup();
    const bytes = await png("#123456");
    const a = await images.upload(ctx, cat.id, file(bytes));
    const b = await images.upload(ctx, cat.id, file(bytes));
    expect(b.imageUrl).toBe(a.imageUrl);
    expect(fs.existsSync(path.join(dir, a.imageUrl.slice(9)))).toBe(true);
  });

  it("DB hatasında yeni dosya silinir", async () => {
    const { ctx, cat } = await setup();
    const before = listFiles(dir);
    publishMock.mockRejectedValueOnce(new Error("db down"));
    await expect(images.upload(ctx, cat.id, file(await png("#abcdef")))).rejects.toThrow("db down");
    expect(listFiles(dir)).toEqual(before);
  });

  it("başarısız işlemde DB'nin referans verdiği dosya silinmez", async () => {
    const { ctx, cat } = await setup();
    const bytes = await png("#778899");
    const first = await images.upload(ctx, cat.id, file(bytes));
    const disk = path.join(dir, first.imageUrl.slice(9));
    publishMock.mockRejectedValueOnce(new Error("db down"));
    await expect(images.upload(ctx, cat.id, file(bytes))).rejects.toThrow("db down");
    expect(fs.existsSync(disk)).toBe(true);
    expect((await testDb.menuNode.findUniqueOrThrow({ where: { id: cat.id } })).imageUrl).toBe(first.imageUrl);
  });

  it("eşzamanlı aynı içerikli iki yükleme sonrası dosya yerinde kalır", async () => {
    const { ctx, cat } = await setup();
    const bytes = await png("#334455");
    const [a, b] = await Promise.all([
      images.upload(ctx, cat.id, file(bytes)),
      images.upload(ctx, cat.id, file(bytes)),
    ]);
    expect(a.imageUrl).toBe(b.imageUrl);
    expect(fs.existsSync(path.join(dir, a.imageUrl.slice(9)))).toBe(true);
  });

  it("kesik (kısmi) dosya atomik onarılır; aynı boyutlu farklı içerik CONFLICT", async () => {
    const { saveUploadExclusive } = await import("@/lib/uploads");
    const full = path.join(dir, "menu", "x", "p.webp");
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, Buffer.from("kes"));
    const data = Buffer.from("tam-icerik");
    expect(await saveUploadExclusive("menu/x/p.webp", data)).toEqual({ created: true });
    expect(fs.readFileSync(full).equals(data)).toBe(true);
    expect(await saveUploadExclusive("menu/x/p.webp", data)).toEqual({ created: false });
    await expect(saveUploadExclusive("menu/x/p.webp", Buffer.from("TAM-ICERIK"))).rejects.toMatchObject({
      code: "CONFLICT",
    });
    fs.mkdirSync(path.join(dir, "menu", "x", "d.webp"));
    await expect(saveUploadExclusive("menu/x/d.webp", data)).rejects.toMatchObject({ code: "VALIDATION" });
  });
});
