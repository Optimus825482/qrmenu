import { acknowledge, answer, appWindow } from "../definitionsUi";
import { expect, login, resetAndSeed, test } from "../fixtures";
import { sql } from "../helpers/acceptanceDb";
import { newContextPage, openAdminShell } from "../menuUi";

/**
 * Kabul 1 (spec §15): 3 otel seed'de, silinemez; otel bazlı modül kapatılabilir.
 * Not: panelde "Otel sil" yoktur (otel yaşam döngüsü kod/seed işidir); silinemezlik arayüzde silme denetiminin
 * yokluğu, sistem otelinin pasife alınamaması (birim: admin-hotels.test.ts) ve veritabanı kısıtı ile kanıtlanır.
 */
test.describe.configure({ mode: "serial" });
test.use({ locale: "tr-TR" });

test.beforeAll(() => {
  resetAndSeed();
});

const MR = { name: "Merit Royal", code: "ROYAL" };

async function roomToken(number: string, hotelCode: string): Promise<string> {
  const rows = await sql<{ qr_token: string }>(
    `SELECT r.qr_token FROM rooms r JOIN hotels h ON h.id = r.hotel_id WHERE r.number = $1 AND h.code = $2`,
    [number, hotelCode],
  );
  return rows[0].qr_token;
}

test.describe("@kabul-1 oteller ve modüller", () => {
  test("@kabul-1 seed'de 3 otel var; Otel panelinde silme denetimi yok; veritabanı oteli silmeye izin vermez", async ({ page }) => {
    const hotels = await sql<{ code: string }>(`SELECT code FROM hotels ORDER BY code`);
    expect(hotels.map((h) => h.code)).toEqual(["DIAMOND", "PREMIUM", "ROYAL"]);

    await openAdminShell(page);
    const win = await appWindow(page, "Tanımlamalar", "Merit Royal");
    await expect(win.getByRole("form", { name: "Otel bilgileri" })).toBeVisible();
    await expect(win.getByRole("button", { name: /sil/i })).toHaveCount(0);
    await expect(win.getByRole("button", { name: "Seçili kaydı sil" })).toHaveCount(0);

    // Hotel rows are referenced by users, rooms and outlets (ON DELETE RESTRICT): a raw DELETE is refused.
    for (const code of ["ROYAL", "PREMIUM", "DIAMOND"]) {
      await expect(sql(`DELETE FROM hotels WHERE code = $1`, [code])).rejects.toThrow(/foreign key|violates/i);
    }
    expect((await sql(`SELECT 1 FROM hotels`)).length).toBe(3);
  });

  test("@kabul-1 Oda Servisi modülü ROYAL'da kapanınca o otelin misafir kartı kaybolur, diğer otellerin modülü açık kalır; açınca kart döner", async ({
    page,
    browser,
  }) => {
    const royal = await roomToken("101", "ROYAL");
    const guest = await newContextPage(browser);
    try {
      await guest.goto(`/q/${royal}`);
      await expect(guest.getByRole("link", { name: /Oda Servisi/ })).toBeVisible();

      await openAdminShell(page);
      const win = await appWindow(page, "Tanımlamalar", MR.name);
      const modules = win.getByRole("group", { name: "Modüller" });
      await modules.getByRole("switch", { name: "Oda Servisi" }).click();
      await answer(page, "Oda Servisi modülünü güncelle", "Evet");
      await acknowledge(page);
      await expect(modules.getByRole("switch", { name: "Oda Servisi" })).not.toBeChecked();

      await guest.goto(`/q/${royal}`);
      await expect(guest.getByText("Oda Servisi")).toHaveCount(0);
      await guest.goto(`/q/${royal}/oda-servisi`);
      await expect(guest).toHaveURL(new RegExp(`/q/${royal}$`));
      // The other hotels keep their module.
      const others = await sql<{ code: string; enabled: boolean }>(
        `SELECT h.code, m.enabled FROM hotel_modules m JOIN hotels h ON h.id = m.hotel_id
          WHERE m.module_key = 'ROOM_SERVICE' ORDER BY h.code`,
      );
      expect(others).toEqual([
        { code: "DIAMOND", enabled: true },
        { code: "PREMIUM", enabled: true },
        { code: "ROYAL", enabled: false },
      ]);

      await modules.getByRole("switch", { name: "Oda Servisi" }).click();
      await answer(page, "Oda Servisi modülünü güncelle", "Evet");
      await acknowledge(page);
      await expect(modules.getByRole("switch", { name: "Oda Servisi" })).toBeChecked();
      await guest.goto(`/q/${royal}`);
      await expect(guest.getByRole("link", { name: /Oda Servisi/ })).toBeVisible();
    } finally {
      await guest.context().close();
    }
  });

  test("@kabul-1 Minibar modülü ROYAL'da kapanınca o otelin depo ekranları 403 verir, PREMIUM modülü açık kalır; açınca döner", async ({
    page,
    browser,
  }) => {
    await openAdminShell(page);
    const win = await appWindow(page, "Tanımlamalar", MR.name);
    const modules = win.getByRole("group", { name: "Modüller" });
    const depo = await newContextPage(browser);
    try {
      await login(depo, "depo.mr");
      await expect(depo).toHaveURL(/\/depo/);
      expect((await depo.request.get("/api/minibar/depo/dashboard")).status()).toBe(200);

      await modules.getByRole("switch", { name: "Minibar" }).click();
      await answer(page, "Minibar modülünü güncelle", "Evet");
      await acknowledge(page);
      await expect(modules.getByRole("switch", { name: "Minibar" })).not.toBeChecked();

      expect((await depo.request.get("/api/minibar/depo/dashboard")).status()).toBe(403);
      const state = await sql<{ code: string; enabled: boolean }>(
        `SELECT h.code, m.enabled FROM hotel_modules m JOIN hotels h ON h.id = m.hotel_id
          WHERE m.module_key = 'MINIBAR' ORDER BY h.code`,
      );
      expect(state).toEqual([
        { code: "DIAMOND", enabled: true },
        { code: "PREMIUM", enabled: true },
        { code: "ROYAL", enabled: false },
      ]);

      await modules.getByRole("switch", { name: "Minibar" }).click();
      await answer(page, "Minibar modülünü güncelle", "Evet");
      await acknowledge(page);
      await expect(modules.getByRole("switch", { name: "Minibar" })).toBeChecked();
      expect((await depo.request.get("/api/minibar/depo/dashboard")).status()).toBe(200);
    } finally {
      await depo.context().close();
    }
  });
});
