import type { Locator, Page } from "@playwright/test";
import { expect, login, resetAndSeed, test } from "./fixtures";

// One database state for the whole file (reset once): each test builds on the previous one.
test.describe.configure({ mode: "serial" });

test.beforeAll(() => {
  resetAndSeed();
});

function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(err.message));
  return errors;
}

const desktop = (page: Page) => page.getByRole("region", { name: "Masaüstü" });
const winFor = (page: Page, hotelName: string) =>
  page.getByRole("region", { name: `Tanımlamalar · ${hotelName}`, exact: true });

async function openAdmin(page: Page) {
  await login(page, "admin");
  await expect(page).toHaveURL(/\/admin$/);
  await expect(desktop(page)).toBeVisible();
}

/** Başlat → Tanımlamalar, then the hotel card of `hotel` (admin has three hotels: a picker shows). */
async function openDefinitions(page: Page, hotel: { name: string; code: string }): Promise<Locator> {
  await page.getByRole("button", { name: "başlat" }).click();
  await page
    .getByRole("menu", { name: "Başlat menüsü" })
    .getByRole("menuitem", { name: "Tanımlamalar" })
    .click();
  const picker = page.getByRole("region", { name: "Tanımlamalar", exact: true });
  await picker
    .getByRole("button", { name: new RegExp(`^${hotel.name}\\s*${hotel.code}$`) })
    .click();
  // The newest window of that hotel (a restored or earlier one may exist already).
  const win = winFor(page, hotel.name).last();
  await expect(win).toBeVisible();
  return win;
}

/** The restored window of `hotel` when the saved layout brought one back, else a fresh one. */
async function definitionsWindow(page: Page, hotel: { name: string; code: string }) {
  const existing = winFor(page, hotel.name);
  if ((await existing.count()) > 0) return existing.first();
  return openDefinitions(page, hotel);
}

const node = (win: Locator, name: string) => win.getByRole("treeitem", { name, exact: true });
const row = (win: Locator, text: string) => win.getByRole("row").filter({ hasText: text });

const MR = { name: "Merit Royal", code: "MR" };
const MRP = { name: "Merit Royal Premium", code: "MRP" };

test("Tanımlamalar: ağaç düğümleri, Otel paneli kaydı ve henüz yapılmayan bölümler", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await openAdmin(page);
  const win = await openDefinitions(page, MR);

  await expect(win.getByRole("treeitem")).toHaveCount(10);
  const labels = await win.getByRole("treeitem").allTextContents();
  expect(labels).toEqual([
    "Otel",
    "Katlar",
    "Oda Tipleri",
    "Odalar",
    "Outletler",
    "Masalar",
    "Kullanıcılar",
    "Ekipler",
    "Roller",
    "Yetki Matrisi",
  ]);
  await expect(node(win, "Otel")).toHaveAttribute("aria-selected", "true");

  // Otel paneli: the code is fixed, the rest saves and survives a reload.
  const form = win.getByRole("form", { name: "Otel bilgileri" });
  await expect(form.getByLabel("Otel kodu")).toHaveValue("MR");
  await expect(form.getByLabel("Otel kodu")).toHaveAttribute("readonly", "");
  await expect(form.getByLabel("Aktif", { exact: true })).toBeDisabled(); // sistem oteli
  await form.getByLabel("Adres", { exact: true }).fill("Girne, KKTC");
  await form.getByLabel("Telefon").fill("+90 392 000 00 00");
  await form.getByLabel("Logo adresi").fill("javascript:alert(1)");
  await form.getByRole("button", { name: "Kaydet" }).click();
  await expect(form.getByText("Logo adresi / veya http(s):// ile başlamalıdır")).toBeVisible();
  await form.getByLabel("Logo adresi").fill("");
  await form.getByLabel("Bildirim e-postaları").check();
  await form.getByRole("button", { name: "Kaydet" }).click();
  await expect(win.getByRole("status").filter({ hasText: "Otel bilgileri kaydedildi" })).toBeVisible();

  // Not-yet-built sections say which task adds them.
  await node(win, "Odalar").click();
  await expect(win.getByText("Bu bölüm P1 Task 3'te eklenecek.")).toBeVisible();
  await node(win, "Roller").click();
  await expect(win.getByText("Bu bölüm P1 Task 6'te eklenecek.")).toBeVisible();

  // Arrow keys walk the tree.
  await node(win, "Roller").focus();
  await page.keyboard.press("ArrowDown");
  await expect(node(win, "Yetki Matrisi")).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Home");
  await expect(node(win, "Otel")).toHaveAttribute("aria-selected", "true");

  await page.reload();
  const again = winFor(page, MR.name).first();
  await expect(again).toBeVisible();
  const saved = again.getByRole("form", { name: "Otel bilgileri" });
  await expect(saved.getByLabel("Adres", { exact: true })).toHaveValue("Girne, KKTC");
  await expect(saved.getByLabel("Bildirim e-postaları")).toBeChecked();
  expect(errors).toEqual([]);
});

test("Katlar: Yeni 9. Kat → listede; aynı numara CONFLICT; düzenle; sil", async ({ page }) => {
  const errors = trackErrors(page);
  await openAdmin(page);
  const win = await definitionsWindow(page, MR);

  await node(win, "Katlar").click();
  await expect(win.getByText("Bu otelde kayıtlı kat yok")).toBeVisible();

  await win.getByRole("button", { name: "Yeni kayıt" }).click();
  const dialog = page.getByRole("dialog", { name: "Yeni kat" });
  await dialog.getByLabel("Kat numarası").fill("9");
  await dialog.getByLabel("Kat adı").fill("9. Kat");
  await dialog.getByRole("button", { name: "Kaydet" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(row(win, "9. Kat")).toBeVisible();
  await expect(win.getByText("1 kayıt")).toBeVisible();

  // Same number again: Turkish CONFLICT in the dialog, nothing added.
  await win.getByRole("button", { name: "Yeni kayıt" }).click();
  await dialog.getByLabel("Kat numarası").fill("9");
  await dialog.getByLabel("Kat adı").fill("Kopya");
  await dialog.getByRole("button", { name: "Kaydet" }).click();
  await expect(dialog.getByRole("alert")).toHaveText("Bu numarada bir kat zaten var");
  // A blank number is a field error, not a crash.
  await dialog.getByLabel("Kat numarası").fill("");
  await dialog.getByRole("button", { name: "Kaydet" }).click();
  await expect(dialog.getByText("Kat numarası gerekli")).toBeVisible();
  await dialog.getByRole("button", { name: "Vazgeç" }).click();
  await expect(win.getByText("1 kayıt")).toBeVisible();

  // Edit.
  await row(win, "9. Kat").click();
  await win.getByRole("button", { name: "Seçili kaydı düzenle" }).click();
  const edit = page.getByRole("dialog", { name: "Katı düzenle" });
  await expect(edit.getByLabel("Kat numarası")).toHaveValue("9");
  await edit.getByLabel("Kat adı").fill("Dokuzuncu Kat");
  await edit.getByRole("button", { name: "Kaydet" }).click();
  await expect(row(win, "Dokuzuncu Kat")).toBeVisible();

  // Delete asks first; Hayır keeps the row, Evet removes it.
  await win.getByRole("button", { name: "Seçili kaydı sil" }).click();
  const ask = page.getByRole("dialog", { name: "Katı sil" });
  await ask.getByRole("button", { name: "Hayır" }).click();
  await expect(row(win, "Dokuzuncu Kat")).toBeVisible();
  await win.getByRole("button", { name: "Seçili kaydı sil" }).click();
  await ask.getByRole("button", { name: "Evet" }).click();
  await expect(row(win, "Dokuzuncu Kat")).toHaveCount(0);
  await expect(win.getByText("Bu otelde kayıtlı kat yok")).toBeVisible();
  expect(errors).toEqual([]);
});

test("Oda Tipleri: Yeni Test Suit (2 kabin) → listede; negatif kabin alan hatası; başka otelden kopyala; sil", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await openAdmin(page);
  const win = await definitionsWindow(page, MR);

  await node(win, "Oda Tipleri").click();
  await win.getByRole("button", { name: "Yeni kayıt" }).click();
  const dialog = page.getByRole("dialog", { name: "Yeni oda tipi" });
  await dialog.getByLabel("Oda tipi adı").fill("Test Suit");
  await dialog.getByLabel("Kabin sayısı").fill("-1");
  await dialog.getByRole("button", { name: "Kaydet" }).click();
  await expect(dialog.getByText("Kabin sayısı 0 dan küçük olamaz")).toBeVisible();
  await dialog.getByLabel("Kabin sayısı").fill("2");
  await dialog.getByRole("button", { name: "Kaydet" }).click();
  await expect(dialog).toHaveCount(0);
  const created = row(win, "Test Suit");
  await expect(created).toBeVisible();
  await expect(created.getByRole("gridcell").nth(1)).toHaveText("2");

  // The second hotel starts empty and copies the type over.
  const other = await openDefinitions(page, MRP);
  await node(other, "Oda Tipleri").click();
  await expect(other.getByText("Bu otelde kayıtlı oda tipi yok")).toBeVisible();
  await other.getByRole("button", { name: "Başka otelden kopyala" }).click();
  const copy = page.getByRole("dialog", { name: "Başka otelden kopyala" });
  await copy.getByLabel("Kaynak otel").selectOption({ label: MR.name });
  await copy.getByRole("button", { name: "Kopyala" }).click();
  const done = page.getByRole("alertdialog", { name: "Oda tipleri kopyalandı" });
  await expect(done).toContainText("1 oda tipi kopyalandı, 0 oda tipi (aynı ad) atlandı.");
  await done.getByRole("button", { name: "Tamam" }).click();
  await expect(row(other, "Test Suit")).toBeVisible();
  // Copying again changes nothing: the name exists.
  await other.getByRole("button", { name: "Başka otelden kopyala" }).click();
  await copy.getByLabel("Kaynak otel").selectOption({ label: MR.name });
  await copy.getByRole("button", { name: "Kopyala" }).click();
  await expect(done).toContainText("0 oda tipi kopyalandı, 1 oda tipi (aynı ad) atlandı.");
  await done.getByRole("button", { name: "Tamam" }).click();
  await other.getByRole("button", { name: "Kapat" }).click();

  // Delete in the first hotel.
  await row(win, "Test Suit").click();
  await win.getByRole("button", { name: "Seçili kaydı sil" }).click();
  const ask = page.getByRole("dialog", { name: "Oda tipini sil" });
  await ask.getByRole("button", { name: "Evet" }).click();
  await expect(row(win, "Test Suit")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("canlı yenileme: başka pencerede eklenen kat açık listede görünür", async ({ page }) => {
  await openAdmin(page);
  const first = await definitionsWindow(page, MR);
  await node(first, "Katlar").click();

  const second = await openDefinitions(page, MR);
  await node(second, "Katlar").click();
  await second.getByRole("button", { name: "Yeni kayıt" }).click();
  const dialog = page.getByRole("dialog", { name: "Yeni kat" });
  await dialog.getByLabel("Kat numarası").fill("10");
  await dialog.getByLabel("Kat adı").fill("10. Kat");
  await dialog.getByRole("button", { name: "Kaydet" }).click();
  await expect(row(second, "10. Kat")).toBeVisible();
  // The other window learns about it through definition.changed, no click needed.
  await expect(row(first, "10. Kat")).toBeVisible({ timeout: 10_000 });
});

test("mudur.mr (yönetim): Tanımlamalar görünür, tek oteli olduğundan seçici çıkmaz", async ({
  page,
}) => {
  await login(page, "mudur.mr");
  await expect(page).toHaveURL(/\/admin$/);
  await page.getByRole("button", { name: "başlat" }).click();
  await page
    .getByRole("menu", { name: "Başlat menüsü" })
    .getByRole("menuitem", { name: "Tanımlamalar" })
    .click();
  const win = winFor(page, MR.name);
  await expect(win).toBeVisible();
  await node(win, "Katlar").click();
  await expect(row(win, "10. Kat")).toBeVisible();
});
