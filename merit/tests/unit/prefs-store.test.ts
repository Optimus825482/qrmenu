import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseShellPrefs } from "@/shell/prefsSchema";
import { writeShellPrefs } from "@/shell/prefsStore";
import { resetReferenceData, resetTestData, makeUser } from "../helpers/fixtures";
import { testDb } from "../helpers/db";

const layout = parseShellPrefs({ wallpaper: "bliss", icons: [], windows: [] })!;

async function stored(userId: string): Promise<Record<string, unknown>> {
  const row = await testDb.user.findUniqueOrThrow({ where: { id: userId }, select: { prefs: true } });
  return row.prefs as Record<string, unknown>;
}

describe("writeShellPrefs (gerçek test DB)", () => {
  beforeAll(async () => {
    await resetReferenceData();
  });

  afterAll(async () => {
    await resetTestData();
    await testDb.$disconnect();
  });

  it("masaüstünün göndermediği preferredShell kaydı ezmez; diğer prefs anahtarları da kalır", async () => {
    const user = await makeUser({ username: "prefs.store", roleCode: "R-SYS" });
    await testDb.user.update({
      where: { id: user.id },
      data: { prefs: { guide: { seen: true }, shell: { preferredShell: "pos", wallpaper: "eski" } } },
    });

    await writeShellPrefs(testDb, user.id, { ...layout, xpDensity: "compact" });

    const prefs = await stored(user.id);
    expect(prefs.guide).toEqual({ seen: true });
    expect(prefs.shell).toMatchObject({ preferredShell: "pos", wallpaper: "bliss", xpDensity: "compact" });
  });

  it("açıkça gönderilen preferredShell yeni değeri yazar; boş kullanıcı prefs'i oluşur", async () => {
    const user = await makeUser({ username: "prefs.store2", roleCode: "R-SYS" });
    await writeShellPrefs(testDb, user.id, layout);
    expect((await stored(user.id)).shell).not.toHaveProperty("preferredShell");
    await writeShellPrefs(testDb, user.id, { ...layout, preferredShell: "personel" });
    expect((await stored(user.id)).shell).toMatchObject({ preferredShell: "personel" });
  });

  it('saklı shell değeri JSON null ya da nesne olmayan bir değerse temiz bir nesneyle değiştirilir', async () => {
    for (const [name, bad] of [["null", null], ["dizi", [1]], ["sayı", 5]] as const) {
      const user = await makeUser({ username: `prefs.bad.${name === "sayı" ? "sayi" : name}`, roleCode: "R-SYS" });
      await testDb.user.update({ where: { id: user.id }, data: { prefs: { guide: { seen: true }, shell: bad } } });

      await writeShellPrefs(testDb, user.id, layout);

      const prefs = await stored(user.id);
      expect(prefs.guide).toEqual({ seen: true });
      expect(Array.isArray(prefs.shell)).toBe(false);
      expect(prefs.shell).toMatchObject({ wallpaper: "bliss" });
    }
  });
});
