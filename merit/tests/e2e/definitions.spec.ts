import { readFileSync } from "node:fs";
import type { Page } from "@playwright/test";
import {
  acknowledge,
  answer,
  appWindow,
  deleteSelected,
  node,
  row,
  saveEdit,
  saveNew,
  startMenuItem,
  userWizard,
} from "./definitionsUi";
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

async function openAdmin(page: Page) {
  await login(page, "admin");
  await expect(page).toHaveURL(/\/admin$/);
  await expect(desktop(page)).toBeVisible();
}

const MR = { name: "Merit Royal", code: "ROYAL" };
const PREMIUM = { name: "Merit Royal Premium", code: "PREMIUM" };

/** Tanımlamalar window of a hotel (admin has three hotels: a picker shows first). */
const definitions = (page: Page, hotel: { name: string }) => appWindow(page, "Tanımlamalar", hotel.name);
/** Kullanıcı Yönetimi is not bound to a hotel; Ekip Yönetimi is. */
const userManagement = (page: Page) => appWindow(page, "Kullanıcı Yönetimi");
const teamManagement = (page: Page, hotel: { name: string }) => appWindow(page, "Ekip Yönetimi", hotel.name);

test("Tanımlamalar: ağaç düğümleri, Otel paneli kaydı ve modül anahtarları", async ({ page }) => {
  const errors = trackErrors(page);
  await openAdmin(page);
  const win = await definitions(page, MR);

  // Users, roles, teams and the permission matrix live in their own windows now; Outletler expands
  // into the hotel's outlets and the Minibar definitions are a node of their own.
  await expect(node(win, "Havuz Bar")).toBeVisible(); // outlets are loaded
  const labels = (await win.getByRole("treeitem").allTextContents()).map((text) => text.trim());
  expect(labels.slice(0, 5)).toEqual(["Otel", "Katlar", "Oda Tipleri", "Odalar", "Outletler"]);
  expect(labels.at(-1)).toBe("Minibar & Setup Tanımları");
  expect(labels.slice(5, -1)).toEqual(expect.arrayContaining(["Oda Servisi", "Havuz Bar", "Beach Bar"]));
  for (const gone of ["Kullanıcılar", "Ekipler", "Roller", "Yetki Matrisi", "Masalar"]) {
    await expect(node(win, gone)).toHaveCount(0);
  }
  await expect(node(win, "Otel")).toHaveAttribute("aria-selected", "true");

  // Otel paneli: code is fixed, the name saves after the confirmation question.
  const form = win.getByRole("form", { name: "Otel bilgileri" });
  await expect(form.getByLabel("Otel kodu")).toHaveValue("ROYAL");
  await expect(form.getByLabel("Otel kodu")).toHaveAttribute("readonly", "");
  await expect(form.getByLabel("Otel adı")).toHaveValue(MR.name);
  const saved = win.getByRole("status").filter({ hasText: "Otel bilgileri kaydedildi" });
  await form.getByRole("button", { name: "Kaydet" }).click();
  await answer(page, "Otel bilgilerini güncelle", "Hayır");
  await expect(saved).toHaveCount(0);
  // A blank name is refused under the field and nothing is written.
  await form.getByLabel("Otel adı").fill("");
  await form.getByRole("button", { name: "Kaydet" }).click();
  await answer(page, "Otel bilgilerini güncelle", "Evet");
  await expect(form.getByText("Otel adı gerekli")).toBeVisible();
  await form.getByLabel("Otel adı").fill(MR.name);
  await form.getByRole("button", { name: "Kaydet" }).click();
  await answer(page, "Otel bilgilerini güncelle", "Evet");
  await acknowledge(page);
  await expect(saved).toBeVisible();

  // Modüller: turning a module off asks first; Hayır leaves it on.
  const modules = win.getByRole("group", { name: "Modüller" });
  await expect(modules.getByRole("switch")).toHaveCount(4);
  await expect(modules.getByRole("switch", { name: "Minibar" })).toBeChecked();
  await modules.getByRole("switch", { name: "Minibar" }).click();
  await answer(page, "Minibar modülünü güncelle", "Hayır");
  await expect(modules.getByRole("switch", { name: "Minibar" })).toBeChecked();
  await modules.getByRole("switch", { name: "Minibar" }).click();
  await answer(page, "Minibar modülünü güncelle", "Evet");
  await acknowledge(page);
  await expect(modules.getByRole("switch", { name: "Minibar" })).not.toBeChecked();

  // Arrow keys walk the tree.
  await node(win, "Katlar").click();
  await node(win, "Katlar").focus();
  await page.keyboard.press("ArrowDown");
  await expect(node(win, "Oda Tipleri")).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Home");
  await expect(node(win, "Otel")).toHaveAttribute("aria-selected", "true");

  await page.reload();
  const again = await definitions(page, MR);
  await expect(again).toBeVisible();
  // The module switch survived the reload; turning it back on asks again.
  const savedModules = again.getByRole("group", { name: "Modüller" });
  await expect(savedModules.getByRole("switch", { name: "Minibar" })).not.toBeChecked();
  await savedModules.getByRole("switch", { name: "Minibar" }).click();
  await answer(page, "Minibar modülünü güncelle", "Evet");
  await acknowledge(page);
  await expect(savedModules.getByRole("switch", { name: "Minibar" })).toBeChecked();
  expect(errors).toEqual([]);
});

test("Katlar: Yeni 9. Kat → listede; aynı numara CONFLICT; düzenle (onaylı); sil", async ({ page }) => {
  const errors = trackErrors(page);
  await openAdmin(page);
  const win = await definitions(page, MR);

  await node(win, "Katlar").click();
  await expect(win.getByText("Bu otelde kayıtlı kat yok")).toBeVisible();

  await win.getByRole("button", { name: "Yeni kayıt" }).click();
  const dialog = page.getByRole("dialog", { name: "Yeni kat" });
  await dialog.getByLabel("Kat numarası").fill("9");
  await dialog.getByLabel("Kat adı").fill("9. Kat");
  await saveNew(page, dialog);
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

  // Edit: the change is confirmed first.
  await row(win, "9. Kat").click();
  await win.getByRole("button", { name: "Seçili kaydı düzenle" }).click();
  const edit = page.getByRole("dialog", { name: "Katı düzenle" });
  await expect(edit.getByLabel("Kat numarası")).toHaveValue("9");
  await edit.getByLabel("Kat adı").fill("Dokuzuncu Kat");
  await saveEdit(page, edit);
  await expect(row(win, "Dokuzuncu Kat")).toBeVisible();

  // Delete asks first; Hayır keeps the row, Evet removes it.
  await win.getByRole("button", { name: "Seçili kaydı sil" }).click();
  await answer(page, "Katı sil", "Hayır");
  await expect(row(win, "Dokuzuncu Kat")).toBeVisible();
  await deleteSelected(page, win, "Katı sil");
  await expect(row(win, "Dokuzuncu Kat")).toHaveCount(0);
  await expect(win.getByText("Bu otelde kayıtlı kat yok")).toBeVisible();
  expect(errors).toEqual([]);
});

test("Oda Tipleri: Yeni Test Suit (2 kabin) → listede; negatif kabin alan hatası; başka otelden kopyala; sil", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await openAdmin(page);
  const win = await definitions(page, MR);

  await node(win, "Oda Tipleri").click();
  await win.getByRole("button", { name: "Yeni kayıt" }).click();
  const dialog = page.getByRole("dialog", { name: "Yeni oda tipi" });
  await dialog.getByLabel("Oda tipi adı").fill("Test Suit");
  await dialog.getByLabel("Kabin sayısı").fill("-1");
  await dialog.getByRole("button", { name: "Kaydet" }).click();
  await expect(dialog.getByText("Kabin sayısı 0 dan küçük olamaz")).toBeVisible();
  await dialog.getByLabel("Kabin sayısı").fill("2");
  await saveNew(page, dialog);
  const created = row(win, "Test Suit");
  await expect(created).toBeVisible();
  await expect(created.getByRole("gridcell").nth(1)).toHaveText("2");

  // The second hotel starts empty and copies the type over.
  const other = await definitions(page, PREMIUM);
  await node(other, "Oda Tipleri").click();
  await expect(other.getByText("Bu otelde kayıtlı oda tipi yok")).toBeVisible();
  await other.getByRole("button", { name: "Başka otelden kopyala" }).click();
  const copy = page.getByRole("dialog", { name: "Başka otelden kopyala" });
  await copy.getByLabel("Kaynak otel").selectOption({ label: MR.name });
  await saveNew(page, copy, "Kopyala");
  await expect(row(other, "Test Suit")).toBeVisible();
  await expect(other.getByText("1 kayıt")).toBeVisible();
  // Copying again changes nothing: the name exists.
  await other.getByRole("button", { name: "Başka otelden kopyala" }).click();
  await copy.getByLabel("Kaynak otel").selectOption({ label: MR.name });
  await saveNew(page, copy, "Kopyala");
  await expect(other.getByText("1 kayıt")).toBeVisible();
  await other.getByRole("button", { name: "Kapat" }).click();

  // Delete in the first hotel.
  await row(win, "Test Suit").click();
  await deleteSelected(page, win, "Oda tipini sil");
  await expect(row(win, "Test Suit")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("Odalar: Toplu Ekle 901–903 → 3 satır; çakışma uyarısı; 901 kapasite 3; kat filtresi; Excel; sil", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await openAdmin(page);
  const win = await definitions(page, MR);

  // Rooms need floors: add two through the Katlar panel.
  await node(win, "Katlar").click();
  for (const [number, name] of [
    ["5", "5. Kat"],
    ["6", "6. Kat"],
  ]) {
    await win.getByRole("button", { name: "Yeni kayıt" }).click();
    const floor = page.getByRole("dialog", { name: "Yeni kat" });
    await floor.getByLabel("Kat numarası").fill(number);
    await floor.getByLabel("Kat adı").fill(name);
    await saveNew(page, floor);
    await expect(row(win, name)).toBeVisible();
  }

  await node(win, "Odalar").click();
  await expect(win.getByText("Bu filtreyle kayıtlı oda yok")).toBeVisible();
  const filters = win.getByRole("group", { name: "Oda filtreleri" });

  // Toplu Ekle 901–903: the preview lists the numbers before anything is written.
  await win.getByRole("button", { name: "Toplu Ekle" }).click();
  const bulk = page.getByRole("dialog", { name: "Toplu oda ekle" });
  await bulk.getByLabel("Kat", { exact: true }).selectOption({ label: "5. Kat" });
  await bulk.getByLabel("Başlangıç numarası").fill("901");
  await bulk.getByLabel("Bitiş numarası").fill("903");
  const preview = bulk.getByRole("status", { name: "Önizleme" });
  await expect(preview).toContainText("3 oda eklenecek");
  await expect(preview).toContainText("901, 902, 903");
  await saveNew(page, bulk, "Ekle");
  for (const number of ["901", "902", "903"]) await expect(row(win, number)).toBeVisible();
  await expect(win.getByText("3 kayıt")).toBeVisible();
  await expect(row(win, "901").getByRole("gridcell").nth(6)).toHaveText("yok"); // QR column

  // The same range again: the preview warns and nothing is written.
  await win.getByRole("button", { name: "Toplu Ekle" }).click();
  await bulk.getByLabel("Başlangıç numarası").fill("902");
  await bulk.getByLabel("Bitiş numarası").fill("905");
  await expect(bulk.getByRole("status", { name: "Önizleme" })).toContainText(
    "2 numara zaten kayıtlı (902, 903)",
  );
  await bulk.getByRole("button", { name: "Ekle" }).click();
  await expect(bulk.getByRole("alert")).toContainText("Hiçbir oda eklenmedi");
  // An unreadable skip list is a field error.
  await bulk.getByLabel("Atlanacak numaralar").fill("abc");
  await bulk.getByRole("button", { name: "Ekle" }).click();
  await expect(bulk.getByText("Atlanacak numaraları virgülle ayırarak")).toBeVisible();
  await bulk.getByRole("button", { name: "Vazgeç" }).click();
  await expect(win.getByText("3 kayıt")).toBeVisible();

  // Edit 901: capacity 3.
  await row(win, "901").click();
  await win.getByRole("button", { name: "Seçili kaydı düzenle" }).click();
  const edit = page.getByRole("dialog", { name: "Odayı düzenle" });
  await expect(edit.getByLabel("Oda numarası")).toHaveValue("901");
  await edit.getByLabel("Kapasite").fill("x");
  await edit.getByRole("button", { name: "Kaydet" }).click();
  await answer(page, "Değişikliği onayla", "Evet");
  await expect(edit.getByText("Kapasite sayı olmalıdır")).toBeVisible();
  await edit.getByLabel("Kapasite").fill("3");
  await edit.getByLabel("Misafir mesajı").fill("Hoş geldiniz");
  await saveEdit(page, edit);
  await expect(row(win, "901").getByRole("gridcell").nth(3)).toHaveText("3");

  // A room on the other floor; the floor filter tells them apart.
  await win.getByRole("button", { name: "Yeni kayıt" }).click();
  const fresh = page.getByRole("dialog", { name: "Yeni oda" });
  await fresh.getByLabel("Oda numarası").fill("601");
  await fresh.getByLabel("Kat", { exact: true }).selectOption({ label: "6. Kat" });
  await saveNew(page, fresh);
  await expect(row(win, "601")).toBeVisible();
  await expect(win.getByText("4 kayıt")).toBeVisible();
  await filters.getByLabel("Kat").selectOption({ label: "6. Kat" });
  await expect(win.getByText("1 kayıt")).toBeVisible();
  await expect(row(win, "901")).toHaveCount(0);
  await filters.getByLabel("Kat").selectOption({ label: "5. Kat" });
  await expect(win.getByText("3 kayıt")).toBeVisible();
  await filters.getByLabel("Kat").selectOption({ label: "Tümü" });
  await expect(win.getByText("4 kayıt")).toBeVisible();

  // Excel export downloads odalar-<otel kodu>.xlsx.
  const download = page.waitForEvent("download");
  await win.getByRole("button", { name: "Excel'e aktar" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe(`odalar-${MR.code}.xlsx`);
  const bytes = readFileSync((await file.path()) as string);
  expect(bytes.subarray(0, 2).toString()).toBe("PK"); // an .xlsx is a zip archive

  // Delete asks first.
  await row(win, "601").click();
  await deleteSelected(page, win, "Odayı sil");
  await expect(row(win, "601")).toHaveCount(0);
  await expect(win.getByText("3 kayıt")).toBeVisible();
  expect(errors).toEqual([]);
});

test("Outletler: Yeni Havuz Bar 2 (menü + sipariş) → listede; düzenleyip KDS aç; ikinci oda servisi CONFLICT; alan ekle", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await openAdmin(page);
  const win = await definitions(page, MR);

  await node(win, "Outletler").click();
  await expect(row(win, "Oda Servisi")).toBeVisible(); // seeded
  await win.getByRole("button", { name: "Yeni kayıt" }).click();
  const dialog = page.getByRole("dialog", { name: "Yeni outlet" });
  await dialog.getByLabel("Outlet adı").fill("Havuz Bar 2");
  await dialog.getByLabel("Tür").selectOption({ label: "Bar" });
  // Ordering without a menu is rejected under the field.
  await dialog.getByLabel("Menü", { exact: true }).uncheck();
  await dialog.getByLabel("Sipariş modülü (garson / kasa)").check();
  await dialog.getByRole("button", { name: "Kaydet" }).click();
  await expect(dialog.getByText("Sipariş almak için menü açık olmalıdır")).toBeVisible();
  await dialog.getByLabel("Menü", { exact: true }).check();
  await saveNew(page, dialog);

  const created = row(win, "Havuz Bar 2");
  await expect(created).toBeVisible();
  await expect(created.getByText("QR Menü")).toBeVisible();
  await expect(created.getByText("QR Sipariş")).toBeVisible();
  await expect(created.getByText("KDS", { exact: true })).toHaveCount(0);
  // The new outlet is also a node of the tree now.
  await expect(node(win, "Havuz Bar 2")).toBeVisible();

  // Edit (confirmed): the kitchen display switch shows as a badge.
  await created.click();
  await win.getByRole("button", { name: "Seçili kaydı düzenle" }).click();
  const edit = page.getByRole("dialog", { name: "Outleti düzenle" });
  await edit.getByLabel("Mutfak ekranı (KDS)").check();
  await saveEdit(page, edit);
  await expect(row(win, "Havuz Bar 2").getByText("KDS", { exact: true })).toBeVisible();

  // A second room-service outlet is refused with the Turkish message.
  await win.getByRole("button", { name: "Yeni kayıt" }).click();
  await dialog.getByLabel("Outlet adı").fill("Oda Servisi 2");
  await dialog.getByLabel("Tür").selectOption({ label: "Oda Servisi" });
  await dialog.getByRole("button", { name: "Kaydet" }).click();
  await expect(dialog.getByRole("alert")).toHaveText("Her otelde bir oda servisi outleti olabilir");
  await dialog.getByRole("button", { name: "Vazgeç" }).click();

  // Tables need an area: "Alan Ekle" on the selected outlet.
  await row(win, "Havuz Bar 2").click();
  await win.getByRole("button", { name: "Alan Ekle" }).click();
  const area = page.getByRole("dialog", { name: "Outlet alanı ekle" });
  await expect(area.getByLabel("Outlet")).toHaveValue("Havuz Bar 2");
  await saveNew(page, area, "Ekle");
  expect(errors).toEqual([]);
});

test("Masalar (outlet düğümü): Toplu Ekle 1–5 → 5 masa; tekrar CONFLICT; tek masa ekle/sil; masalı outlet silinemez", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await openAdmin(page);
  const win = await definitions(page, MR);

  // Tables live under their outlet; labels are "<outlet> <sıra no>".
  await node(win, "Havuz Bar 2").click();
  await expect(win.getByText("Bu outletin kayıtlı masası yok")).toBeVisible();
  await win.getByRole("button", { name: "Toplu Ekle" }).click();
  const bulk = page.getByRole("dialog", { name: "Toplu masa ekle" });
  await bulk.getByLabel("Başlangıç numarası").fill("1");
  await bulk.getByLabel("Bitiş numarası").fill("5");
  await saveNew(page, bulk, "Ekle");
  for (const label of ["Havuz Bar 2 1", "Havuz Bar 2 2", "Havuz Bar 2 3", "Havuz Bar 2 4", "Havuz Bar 2 5"]) {
    await expect(row(win, label)).toBeVisible();
  }
  await expect(win.getByText("5 kayıt")).toBeVisible();

  // Overlapping range: nothing is written.
  await win.getByRole("button", { name: "Toplu Ekle" }).click();
  await bulk.getByLabel("Başlangıç numarası").fill("3");
  await bulk.getByLabel("Bitiş numarası").fill("7");
  await bulk.getByRole("button", { name: "Ekle" }).click();
  await expect(bulk.getByRole("alert")).toContainText("Hiçbir masa eklenmedi");
  await bulk.getByRole("button", { name: "Vazgeç" }).click();
  await expect(win.getByText("5 kayıt")).toBeVisible();

  // Single table: new (named), then delete.
  await win.getByRole("button", { name: "Yeni kayıt" }).click();
  const one = page.getByRole("dialog", { name: "Yeni masa" });
  await one.getByLabel("Masa adı (isteğe bağlı)").fill("VIP 1");
  await saveNew(page, one);
  await expect(row(win, "VIP 1")).toBeVisible();
  await deleteSelected(page, win, "Masayı sil");
  // Single confirmation, no success modal: only a non-blocking "silindi" notice remains.
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("status").filter({ hasText: "silindi" }).first()).toBeVisible();
  await expect(row(win, "VIP 1")).toHaveCount(0);

  // The outlet with tables cannot be deleted.
  await node(win, "Outletler").click();
  await row(win, "Havuz Bar 2").click();
  await win.getByRole("button", { name: "Seçili kaydı sil" }).click();
  await answer(page, "Outleti sil", "Evet");
  const refused = page.getByRole("alertdialog", { name: "Outlet silinemedi" });
  await expect(refused).toContainText("pasife alın");
  await refused.getByRole("button", { name: "Tamam" }).click();
  await expect(row(win, "Havuz Bar 2")).toBeVisible();
  expect(errors).toEqual([]);
});

test("Kullanıcı Yönetimi: Yeni test.garson (R-GAR, MR) listede; Ekip Yönetimi: Havuz Bar ekibine eklenir; pasife al onaylı", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await openAdmin(page);
  const users = await userManagement(page);

  await expect(row(users, "garson.havuz")).toBeVisible();
  await users.getByRole("button", { name: "Yeni kayıt" }).click();
  // Step 1: person and role.
  const wizard = userWizard(page);
  await wizard.getByLabel("Ad soyad").fill("Test Garson");
  await wizard.getByLabel("Görev (F&B)").selectOption({ label: "Garson" });
  await wizard.getByLabel("Rol ve yetkiler").selectOption({ label: "Garson" });
  await wizard.getByLabel("E-posta adresi").fill("test.garson@example.com");
  await wizard.getByLabel("Sisteme giriş kullanıcı adı").fill("test.garson");
  await wizard.getByRole("button", { name: "İleri" }).click();
  // Step 2: hotel; a hotel is required for outlet staff.
  await wizard.getByRole("button", { name: "Kullanıcıyı kaydet" }).click();
  await expect(wizard.getByRole("alert")).toContainText("En az bir otel atayın");
  await wizard.getByLabel("Ana otel").selectOption({ label: MR.name });
  await wizard.getByRole("button", { name: "Kullanıcıyı kaydet" }).click();
  // Step 3: the generated temporary credentials are shown once.
  await expect(wizard.getByLabel("Sisteme giriş kullanıcı adı")).toHaveValue("test.garson");
  await expect(wizard.getByLabel("Geçici şifre")).toHaveValue(/.+/);
  await wizard.getByRole("button", { name: "Tamam" }).click();
  await expect(wizard).toHaveCount(0);
  // The seed has many users (the new one may land on page 2): narrow the grid with its search box.
  await users.getByRole("searchbox").fill("test.garson");
  await expect(row(users, "test.garson")).toBeVisible();
  await expect(row(users, "test.garson")).toContainText("Garson");
  await expect(row(users, "test.garson")).toContainText("şifre yenilenecek"); // first login must change it

  // Ekip Yönetimi: add the new user to the Havuz Bar team through the quick-add list.
  const teams = await teamManagement(page, MR);
  await node(teams, "Havuz Bar").click();
  await expect(row(teams, "garson.havuz")).toBeVisible();
  await teams.getByRole("button", { name: "Hızlı kullanıcı ekle" }).click();
  const add = page.getByRole("dialog", { name: "Hızlı kullanıcı ekle" });
  await add.getByLabel("Görev seçin").selectOption({ label: "Garson" });
  await add.getByRole("button", { name: /test\.garson/ }).click();
  await add.locator("footer").getByRole("button", { name: "Kapat" }).click();
  await expect(row(teams, "test.garson")).toBeVisible();

  // Pasife al asks first; Hayır changes nothing, Evet marks the account passive.
  await users.dispatchEvent("pointerdown"); // bring the window above Ekip Yönetimi
  await row(users, "test.garson").click();
  await users.getByRole("button", { name: "Pasife al" }).click();
  await answer(page, "Kullanıcıyı pasife al", "Hayır");
  await expect(row(users, "test.garson").locator('.xp-badge[data-on="true"]')).toBeVisible();
  await users.getByRole("button", { name: "Pasife al" }).click();
  await answer(page, "Kullanıcıyı pasife al", "Evet");
  await acknowledge(page);
  await expect(row(users, "test.garson").locator('.xp-badge[data-on="false"]')).toBeVisible();
  expect(errors).toEqual([]);
});

test("Roller: Yeni R-TST (OUTLET) → Yetki Matrisi: Outlet Garson Ekranı görüntüle işaretle → yenile → işaretli; yinelenen kod reddedilir", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await openAdmin(page);
  const win = await userManagement(page);

  await node(win, "Roller").click();
  await win.getByRole("button", { name: "Yeni kayıt" }).click();
  const dialog = page.getByRole("dialog", { name: "Yeni rol" });
  await dialog.getByLabel("Kod").fill("R-TST");
  await dialog.getByLabel("Ad", { exact: true }).fill("Test Rolü");
  await dialog.getByLabel("Tür").selectOption("OUTLET");
  await dialog.getByLabel("Açılış ekranı").selectOption({ label: "Outlet Garson Ekranı" });
  await saveNew(page, dialog);
  await expect(row(win, "R-TST")).toBeVisible();

  // The code is unique: a second R-TST is refused under the field.
  await win.getByRole("button", { name: "Yeni kayıt" }).click();
  const again = page.getByRole("dialog", { name: "Yeni rol" });
  await again.getByLabel("Kod").fill("R-TST");
  await again.getByLabel("Ad", { exact: true }).fill("Başka");
  await again.getByRole("button", { name: "Kaydet" }).click();
  await expect(again.getByText("Bu rol kodu zaten kullanılıyor").first()).toBeVisible();
  await again.getByRole("button", { name: "Vazgeç" }).click();

  // A blank role has no rights yet: tick "Görüntüle" of the waiter screen (confirmed per change).
  await node(win, "Yetki Matrisi").click();
  await win.getByLabel("Rol", { exact: true }).selectOption({ label: "R-TST — Test Rolü" });
  const cell = win.getByRole("checkbox", { name: "Outlet Garson Ekranı · Görüntüle" });
  await expect(cell).not.toBeChecked();
  await cell.click();
  await answer(page, "Ekran yetkisini güncelle", "Evet");
  await expect(cell).toBeChecked();

  await page.reload();
  const reloaded = await userManagement(page);
  await node(reloaded, "Yetki Matrisi").click();
  await reloaded.getByLabel("Rol", { exact: true }).selectOption({ label: "R-TST — Test Rolü" });
  await expect(reloaded.getByRole("checkbox", { name: "Outlet Garson Ekranı · Görüntüle" })).toBeChecked();
  expect(errors).toEqual([]);
});

test("canlı yenileme: başka pencerede eklenen kat açık listede görünür", async ({ page }) => {
  await openAdmin(page);
  const first = await definitions(page, MR);
  await node(first, "Katlar").click();

  // A second Tanımlamalar window of the same hotel (the restored one stays open).
  await page.getByRole("button", { name: "başlat" }).click();
  await page.getByRole("menu", { name: "Başlat menüsü" }).getByRole("menuitem", { name: "Tanımlamalar", exact: true }).click();
  await page
    .getByRole("region", { name: "Tanımlamalar", exact: true })
    .getByRole("button", { name: new RegExp(`^${MR.name} logosu\\s+${MR.name}$`) })
    .click();
  const second = page.getByRole("region", { name: `Tanımlamalar · ${MR.name}`, exact: true }).last();
  await expect(second).toBeVisible();
  await node(second, "Katlar").click();
  await second.getByRole("button", { name: "Yeni kayıt" }).click();
  const dialog = page.getByRole("dialog", { name: "Yeni kat" });
  await dialog.getByLabel("Kat numarası").fill("10");
  await dialog.getByLabel("Kat adı").fill("10. Kat");
  await saveNew(page, dialog);
  await expect(row(second, "10. Kat")).toBeVisible();
  // The other window learns about it through definition.changed, no click needed.
  await expect(row(first, "10. Kat")).toBeVisible({ timeout: 10_000 });
});

test("mudur.mr (yönetim): Tanımlamalar görünür, tek oteli olduğundan seçici çıkmaz", async ({ page }) => {
  await login(page, "mudur.mr");
  await expect(page).toHaveURL(/\/admin$/);
  await page.getByRole("button", { name: "başlat" }).click();
  await startMenuItem(page, "Tanımlamalar").click();
  const win = page.getByRole("region", { name: `Tanımlamalar · ${MR.name}`, exact: true }).last();
  await expect(win).toBeVisible();
  await node(win, "Katlar").click();
  await expect(row(win, "10. Kat")).toBeVisible();
});

test("mudur.mr (yönetim): Roller ve Yetki Matrisi salt okunur", async ({ page }) => {
  await login(page, "mudur.mr");
  await expect(page).toHaveURL(/\/admin$/);
  const win = await userManagement(page);
  await node(win, "Roller").click();
  await expect(row(win, "R-TST")).toBeVisible();
  await expect(win.getByRole("button", { name: "Yeni kayıt" })).toHaveCount(0);
  await node(win, "Yetki Matrisi").click();
  await expect(win.getByText("yalnızca sistem yöneticisi değiştirebilir")).toBeVisible();
  await win.getByLabel("Rol", { exact: true }).selectOption({ label: "R-TST — Test Rolü" });
  await expect(win.getByRole("checkbox", { name: "Outlet Garson Ekranı · Görüntüle" })).toBeDisabled();
});
