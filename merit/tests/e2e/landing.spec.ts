import { expect, login, resetAndSeed, test } from "./fixtures";

// The specs share one database state (reset once in beforeAll) and must run in order.
test.describe.configure({ mode: "serial" });

test.beforeAll(() => {
  resetAndSeed();
});

/** Landing path of every role (seed user `rol.<kod>`). */
const LANDINGS: Record<string, string> = {
  "R-SYS": "/admin",
  "R-ITT": "/admin",
  "R-OTM": "/admin",
  "R-FBM": "/admin",
  "R-SGF": "/garson",
  "R-GAR": "/garson",
  "R-BAR": "/garson",
  "R-BUT": "/garson",
  "R-OUT": "/garson/cagrilar",
  "R-ODS": "/oda-servisi",
  "R-KAS": "/kasa",
  "R-MUS": "/kds",
  "R-MUP": "/kds",
  "R-KDS": "/kds",
  "R-KAT": "/kat",
  "R-DEP": "/depo/stok",
  "R-HKS": "/depo/raporlar",
};

for (const [code, expected] of Object.entries(LANDINGS)) {
  test(`${code} girişi ${expected} sayfasına iner`, async ({ page }) => {
    await login(page, `rol.${code.toLowerCase()}`);
    // Outlet roles pick their outlet on the login page itself; the others go straight through /baslat.
    const picker = page.getByRole("heading", { name: "Çalışacağınız outleti seçin" });
    await expect
      .poll(
        async () => {
          if (new URL(page.url()).pathname === "/giris" && (await picker.isVisible())) {
            await page.getByRole("region").getByRole("button").first().click();
          }
          return new URL(page.url()).pathname;
        },
        { timeout: 25_000 },
      )
      .toBe(expected);

    const response = await page.reload();
    expect(response?.status()).toBe(200);
    await expect(page.locator("body")).not.toContainText(/Giriş Yap|This page could not be found|Application error/);
  });
}

test("kat.mr: ana ekranda Doluluk Girişi ve Tanımlamalar yok; yetkisiz ekran açıklanır ve bildirim günde bir kez gider", async ({ page }) => {
  await login(page, "kat.mr");
  await expect(page).toHaveURL(/\/kat$/);
  await expect(page.getByRole("main").getByRole("link", { name: /İşlemlerim/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Doluluk Girişi/ })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Tanımlamalar/ })).toHaveCount(0);

  await page.goto("/depo/doluluk-yukle");
  await expect(page).toHaveURL(/\/yetkisiz\?ekran=MB-DOL$/);
  await expect(page.getByRole("heading", { name: "Bu ekran sana atanmadı" })).toBeVisible();
  await expect(page.getByText("Bu ekranı görmek için 'Görebilirsin' yetkisi gerekir.")).toBeVisible();

  const report = page.getByRole("button", { name: "Yöneticine bildir" });
  await report.click();
  await expect(page.getByRole("status")).toContainText("Yöneticinize bildirildi");
  await report.click();
  await expect(page.getByRole("status")).toContainText("zaten bildirdiniz");

  await page.reload();
  await expect(page).toHaveURL(/\/yetkisiz\?ekran=MB-DOL$/);
  await page.getByRole("link", { name: "Ana ekrana dön" }).click();
  await expect(page).toHaveURL(/\/kat$/);
});

test("kat.mr: /kat?filtre=dnd kat kartlarını süzer", async ({ page }) => {
  await login(page, "kat.mr");
  await expect(page).toHaveURL(/\/kat$/);
  await page.goto("/kat?filtre=dnd");
  await expect(page.getByText("Süzgeç: DND kaydı olan katlar")).toBeVisible();
});
