import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { testDb } from "../helpers/db";
import { ctxFor, dropReferenceData, hotelId, makeUser, resetReferenceData, resetTestData } from "../helpers/fixtures";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "merit-outlet-logo-"));
process.env.UPLOADS_DIR = dir;

vi.mock("@/lib/prisma", async () => ({ prisma: (await import("../helpers/db")).testDb }));

const { uploadOutletLogo } = await import("@/modules/menu/server/outletLogo");
const { designFromStored, outletLogoPrefix } = await import("@/modules/menu/design");

beforeAll(resetReferenceData);
beforeEach(resetTestData);
afterAll(async () => {
  await dropReferenceData();
  await testDb.$disconnect();
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    // Windows may still hold a handle; the OS temp dir is cleaned up anyway.
  }
});

async function setup() {
  const user = await makeUser({ username: "fbm", roleCode: "R-FBM", hotelCode: "ROYAL" });
  const ctx = await ctxFor(user, { hotelCode: "ROYAL" });
  const outlet = await testDb.outlet.create({
    data: { hotelId: await hotelId("ROYAL"), name: "Logo Bar", type: "BAR", hasMenu: true },
  });
  return { ctx, outlet };
}

const png = () =>
  sharp({ create: { width: 900, height: 300, channels: 4, background: { r: 10, g: 20, b: 30, alpha: 0 } } })
    .png()
    .toBuffer();

describe("outlet logosu", () => {
  it("PNG yüklenir: outletin logo klasöründe webp olur, şeffaflık korunur, 640px'e sığar", async () => {
    const { ctx, outlet } = await setup();
    const bytes = await png();
    const { logoUrl } = await uploadOutletLogo(ctx, outlet.id, { name: "logo.png", type: "image/png", size: bytes.length, bytes });
    expect(logoUrl.startsWith(outletLogoPrefix(outlet.id))).toBe(true);
    expect(logoUrl).toMatch(/[a-f0-9]{16}\.webp$/);
    const meta = await sharp(fs.readFileSync(path.join(dir, logoUrl.slice("/uploads/".length)))).metadata();
    expect(meta.format).toBe("webp");
    expect(meta.hasAlpha).toBe(true);
    expect(meta.width).toBe(640);
  });

  it("görsel olmayan dosya reddedilir", async () => {
    const { ctx, outlet } = await setup();
    const bytes = Buffer.from("logo degil");
    await expect(
      uploadOutletLogo(ctx, outlet.id, { name: "logo.png", type: "image/png", size: bytes.length, bytes }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("kayıtlı tasarımda yalnız logo klasöründeki adres kabul edilir", () => {
    const stored = (logoUrl: string) =>
      designFromStored({ ambience: "LUXURY", concept: "FINE_DINING", template: "royal", layout: ["hero", "categories", "items"], options: { logoUrl } } as never);
    expect(stored("/uploads/menu-logo/abc123/0123456789abcdef.webp").options.logoUrl).toBe(
      "/uploads/menu-logo/abc123/0123456789abcdef.webp",
    );
    expect(stored("https://ornek.com/logo.png").options.logoUrl).toBe("");
    expect(stored("/uploads/menu-logo/../x.webp").options.logoUrl).toBe("");
  });
});
