import { Client } from "pg";
import type { BrowserContext, Page } from "@playwright/test";
import { answer, appWindow, node, pickHotel, row, saveEdit, saveNew, startMenuItem, userWizard } from "./definitionsUi";
import { e2eDatabaseUrl } from "./e2eDb";
import { expect, login, resetAndSeed, test } from "./fixtures";

/**
 * Acceptance chain of P1 (spec §14, kabul 22-29): one admin session sets a hotel up end to end
 * (room type, rooms, outlet, tables, user, team, role, permission), a second browser plays the
 * waiter, and the audit log tells the whole story. The tests share one database state and one
 * admin page, so they run in order.
 */
test.describe.configure({ mode: "serial" });

const BASE_URL = (process.env.E2E_BASE_URL ?? "http://localhost:3000");
const MR = { name: "Merit Royal", code: "ROYAL" };
const GARSON = "kabul.garson";
/** The waiter's own password, set at the forced first-login change. */
const GARSON_PASSWORD = "Kabul2026Pw";
/** Temporary password the onboarding wizard shows (read from the dialog, never assumed). */
let garsonTemporaryPassword = "";

let adminContext: BrowserContext;
let garsonContext: BrowserContext;
let admin: Page;
let garson: Page;
/** Console and page errors of the admin page, asserted empty at the end. */
const adminErrors: string[] = [];

test.beforeAll(async ({ browser }) => {
  resetAndSeed();
  // The login rate limiter counts per IP: give each browser its own.
  adminContext = await browser.newContext({
    baseURL: BASE_URL,
    extraHTTPHeaders: { "x-forwarded-for": "10.77.1.1" },
  });
  garsonContext = await browser.newContext({
    baseURL: BASE_URL,
    extraHTTPHeaders: { "x-forwarded-for": "10.77.2.2" },
  });
  admin = await adminContext.newPage();
  admin.on("console", (msg) => {
    if (msg.type() === "error") adminErrors.push(msg.text());
  });
  admin.on("pageerror", (err) => adminErrors.push(err.message));
  garson = await garsonContext.newPage();
});

test.afterAll(async () => {
  await adminContext?.close();
  await garsonContext?.close();
});

const definitions = (page: Page) => appWindow(page, "Tanımlamalar", MR.name);

/** Runs a query against the e2e database the app under test uses (the one resetAndSeed filled). */
async function withDb<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: e2eDatabaseUrl() });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

/**
 * Effective "view" right of a role on a screen in MR, resolved like rbac.ts does: the hotel row
 * wins over the system-wide row; no row means no access. The waiter has no P1 screen of his own
 * (the order queue arrives with a later phase), so this is what his shell would be built from.
 */
async function canView(roleCode: string, screenCode: string): Promise<boolean> {
  return withDb(async (client) => {
    const res = await client.query<{ can_view: boolean }>(
      `SELECT p.can_view
         FROM role_screen_permissions p
         JOIN roles r ON r.id = p.role_id
         JOIN app_screens s ON s.id = p.screen_id
         LEFT JOIN hotels h ON h.id = p.hotel_id
        WHERE r.code = $1 AND s.code = $2 AND (p.hotel_id IS NULL OR h.code = 'ROYAL')
        ORDER BY (p.hotel_id IS NULL) ASC
        LIMIT 1`,
      [roleCode, screenCode],
    );
    return res.rows[0]?.can_view === true;
  });
}

test("admin girer ve Tanımlamalar penceresini Merit Royal için açar", async () => {
  await login(admin, "admin");
  await expect(admin).toHaveURL(/\/admin$/);
  await admin.getByRole("button", { name: "başlat" }).click();
  await startMenuItem(admin, "Tanımlamalar").click();
  await pickHotel(admin, "Tanımlamalar", MR.name);
  await expect(admin.getByRole("region", { name: `Tanımlamalar · ${MR.name}`, exact: true }).first()).toBeVisible();
});

test("oda tipi → kat → toplu oda zinciri", async () => {
  const win = await definitions(admin);

  // The rooms need a floor and a type; the type comes first, as the guide orders it.
  await node(win, "Oda Tipleri").click();
  await win.getByRole("button", { name: "Yeni kayıt" }).click();
  const type = admin.getByRole("dialog", { name: "Yeni oda tipi" });
  await type.getByLabel("Oda tipi adı").fill("Kabul Suit");
  await type.getByLabel("Kabin sayısı").fill("2");
  await saveNew(admin, type);
  await expect(row(win, "Kabul Suit")).toBeVisible();

  await node(win, "Katlar").click();
  await win.getByRole("button", { name: "Yeni kayıt" }).click();
  const floor = admin.getByRole("dialog", { name: "Yeni kat" });
  await floor.getByLabel("Kat numarası").fill("7");
  await floor.getByLabel("Kat adı").fill("Kabul Katı");
  await saveNew(admin, floor);
  await expect(row(win, "Kabul Katı")).toBeVisible();

  await node(win, "Odalar").click();
  await win.getByRole("button", { name: "Toplu Ekle" }).click();
  const bulk = admin.getByRole("dialog", { name: "Toplu oda ekle" });
  await bulk.getByLabel("Kat", { exact: true }).selectOption({ label: "Kabul Katı" });
  await bulk.getByLabel("Oda tipi", { exact: true }).selectOption({ label: "Kabul Suit" });
  await bulk.getByLabel("Başlangıç numarası").fill("701");
  await bulk.getByLabel("Bitiş numarası").fill("703");
  await expect(bulk.getByRole("status", { name: "Önizleme" })).toContainText("701, 702, 703");
  await saveNew(admin, bulk, "Ekle");
  for (const number of ["701", "702", "703"]) await expect(row(win, number)).toBeVisible();
});

test("outlet → alan → masalar", async () => {
  const win = await definitions(admin);

  await node(win, "Outletler").click();
  await win.getByRole("button", { name: "Yeni kayıt" }).click();
  const outlet = admin.getByRole("dialog", { name: "Yeni outlet" });
  await outlet.getByLabel("Outlet adı").fill("Kabul Restoran");
  await outlet.getByLabel("Tür").selectOption({ label: "Salon" });
  await outlet.getByLabel("Menü", { exact: true }).check();
  await outlet.getByLabel("Sipariş modülü (garson / kasa)").check();
  await saveNew(admin, outlet);
  await expect(row(win, "Kabul Restoran")).toBeVisible();

  // Tables belong to an area of the outlet: add one to the selected outlet first.
  await row(win, "Kabul Restoran").click();
  await win.getByRole("button", { name: "Alan Ekle" }).click();
  await saveNew(admin, admin.getByRole("dialog", { name: "Outlet alanı ekle" }), "Ekle");

  // The outlet is a tree node; its tables are listed under it ("<outlet> <sıra no>").
  await node(win, "Kabul Restoran").click();
  await win.getByRole("button", { name: "Toplu Ekle" }).click();
  const bulk = admin.getByRole("dialog", { name: "Toplu masa ekle" });
  await bulk.getByLabel("Başlangıç numarası").fill("1");
  await bulk.getByLabel("Bitiş numarası").fill("3");
  await saveNew(admin, bulk, "Ekle");
  for (const label of ["Kabul Restoran 1", "Kabul Restoran 2", "Kabul Restoran 3"]) {
    await expect(row(win, label)).toBeVisible();
  }
});

test("kullanıcı (garson, R-GAR, MR) → ekip ataması", async () => {
  const users = await appWindow(admin, "Kullanıcı Yönetimi");

  await users.getByRole("button", { name: "Yeni kayıt" }).click();
  const wizard = userWizard(admin);
  await wizard.getByLabel("Ad soyad").fill("Kabul Garson");
  await wizard.getByLabel("Görev (F&B)").selectOption({ label: "Garson" });
  await wizard.getByLabel("Rol ve yetkiler").selectOption({ label: "Garson" });
  await wizard.getByLabel("E-posta adresi").fill("kabul.garson@example.com");
  await wizard.getByLabel("Sisteme giriş kullanıcı adı").fill(GARSON);
  await wizard.getByRole("button", { name: "İleri" }).click();
  await wizard.getByLabel("Ana otel").selectOption({ label: MR.name });
  await wizard.getByRole("button", { name: "Kullanıcıyı kaydet" }).click();
  garsonTemporaryPassword = await wizard.getByLabel("Geçici şifre").inputValue();
  expect(garsonTemporaryPassword).not.toBe("");
  await wizard.getByRole("button", { name: "Tamam" }).click();
  await expect(row(users, GARSON)).toBeVisible();
  await expect(row(users, GARSON)).toContainText("Garson");

  const teams = await appWindow(admin, "Ekip Yönetimi", MR.name);
  await node(teams, "Kabul Restoran").click();
  await teams.getByRole("button", { name: "Hızlı kullanıcı ekle" }).click();
  const add = admin.getByRole("dialog", { name: "Hızlı kullanıcı ekle" });
  await add.getByLabel("Görev seçin").selectOption({ label: "Garson" });
  await add.getByRole("button", { name: new RegExp(GARSON.replace(".", "\\.")) }).click();
  await add.locator("footer").getByRole("button", { name: "Kapat" }).click();
  await expect(row(teams, GARSON)).toBeVisible();
});

test("rol: R-GAR'dan kopyalanan R-TST; garson bu role geçer", async () => {
  const win = await appWindow(admin, "Kullanıcı Yönetimi");

  await node(win, "Roller").click();
  await win.getByRole("button", { name: "Yeni kayıt" }).click();
  const role = admin.getByRole("dialog", { name: "Yeni rol" });
  await role.getByLabel("Kod").fill("R-TST");
  await role.getByLabel("Ad", { exact: true }).fill("Kabul Rolü");
  await role.getByLabel("Tür").selectOption("OUTLET");
  // A copy carries rights, not the landing screen: without one the waiter would land on "/".
  await role.getByLabel("Açılış ekranı").selectOption({ label: "Outlet Garson Ekranı" });
  await role.getByLabel("Yetkileri kopyala").selectOption({ label: "R-GAR — Garson" });
  await saveNew(admin, role);
  await expect(row(win, "R-TST")).toBeVisible();

  // The copy carries the waiter's rights over.
  expect(await canView("R-TST", "QS-KUY")).toBe(true);

  await node(win, "Kullanıcılar").click();
  await row(win, GARSON).click();
  await win.getByRole("button", { name: "Seçili kaydı düzenle" }).click();
  const edit = admin.getByRole("dialog", { name: "Kullanıcıyı düzenle" });
  await edit.getByLabel("Rol", { exact: true }).selectOption({ label: "Kabul Rolü" });
  await saveEdit(admin, edit);
  await expect(row(win, GARSON)).toContainText("Kabul Rolü");
});

test("yetki: R-TST için QS-KUY görüntüle kapanınca garsonda görünmez, açılınca görünür", async () => {
  const win = await appWindow(admin, "Kullanıcı Yönetimi");

  // The waiter works in a second browser the whole time. First login: temporary password -> own
  // password, then the outlet card is picked.
  await garson.goto("/giris");
  await garson.getByLabel("Kullanıcı adı").fill(GARSON);
  await garson.getByLabel("Şifre").fill(garsonTemporaryPassword);
  await garson.getByRole("button", { name: "Giriş Yap" }).click();
  await expect(garson).toHaveURL(/\/sifre-degistir$/);
  await garson.getByLabel("Yeni şifre", { exact: true }).fill(GARSON_PASSWORD);
  await garson.getByLabel("Yeni şifre tekrar").fill(GARSON_PASSWORD);
  await garson.getByRole("button", { name: "Şifremi kaydet ve devam et" }).click();
  await expect(garson).toHaveURL(/\/secim$/);
  await garson.getByRole("button", { name: /Kabul Restoran/ }).click();
  // First login: the mandatory "Erişimim" summary comes before the landing screen; acknowledge it.
  await expect(garson).toHaveURL(/\/erisimim\?hos-geldin=1$/);
  await garson.getByRole("button", { name: "Anladım" }).click();
  await expect(garson).toHaveURL(/\/garson$/); // the role's landing screen (QS-KUY)
  expect(await canView("R-TST", "QS-KUY")).toBe(true);

  await node(win, "Yetki Matrisi").click();
  await win.getByLabel("Rol", { exact: true }).selectOption({ label: "R-TST — Kabul Rolü" });
  const cell = win.getByRole("checkbox", { name: "Outlet Garson Ekranı · Görüntüle" });
  await expect(cell).toBeChecked();
  await cell.click();
  await answer(admin, "Ekran yetkisini güncelle", "Evet");
  await expect(cell).not.toBeChecked();

  await garson.reload();
  await expect(garson).not.toHaveURL(/\/giris/); // still signed in, only the right is gone
  await expect.poll(() => canView("R-TST", "QS-KUY")).toBe(false);

  await cell.click();
  await answer(admin, "Ekran yetkisini güncelle", "Evet");
  await expect(cell).toBeChecked();
  await garson.reload();
  await expect.poll(() => canView("R-TST", "QS-KUY")).toBe(true);
});

test("Kurulum Rehberi: Merit Royal %90 (9/10 zorunlu adım; ürün ve minibar setup bekliyor)", async () => {
  await admin.getByRole("button", { name: "başlat" }).click();
  await startMenuItem(admin, "Kurulum Rehberi").click();
  await pickHotel(admin, "Kurulum Rehberi", MR.name);
  const guide = admin.getByRole("region", { name: `Kurulum Rehberi · ${MR.name}`, exact: true });
  await expect(guide).toBeVisible();
  await expect(guide.getByTestId("guide-percent")).toHaveText("%90");
  const steps = guide.getByRole("list", { name: "Kurulum adımları" }).getByRole("listitem");
  for (const title of ["Katlar", "Oda tipleri", "Odalar", "Outletler", "Sipariş outletlerinde ekip"]) {
    await expect(steps.filter({ hasText: title }).first().getByRole("img", { name: "Tamamlandı" })).toBeVisible();
  }
  // Minibar is on: the 10th mandatory step (product + setup + assignment) is still open here.
  await expect(steps.filter({ hasText: "Ürün ve minibar setup" }).getByRole("img", { name: "Eksik" })).toBeVisible();
});

test("Online Kullanıcılar: garson listede; zorla çıkış → garsonun sonraki gezinmesi /giris", async () => {
  await admin.getByRole("button", { name: "başlat" }).click();
  await startMenuItem(admin, "Online Kullanıcılar").click();
  await pickHotel(admin, "Online Kullanıcılar", MR.name);
  const online = admin.getByRole("region", { name: `Online Kullanıcılar · ${MR.name}`, exact: true });
  await expect(online).toBeVisible();

  const waiter = online.getByRole("row", { name: new RegExp(GARSON.replace(".", "\\.")) });
  await expect(waiter).toBeVisible();
  await waiter.click();
  await online.getByRole("button", { name: "Zorla çıkış" }).click();
  await admin.getByRole("dialog").locator('[data-confirm="ok"]').click();

  // The garson's next navigation bounces to the login page (/kat only needs a valid session).
  await expect
    .poll(
      async () => {
        await garson.goto("/kat");
        return new URL(garson.url()).pathname;
      },
      { timeout: 10_000 },
    )
    .toBe("/giris");
});

test("Denetim Günlüğü: zincirin satırları", async () => {
  await admin.getByRole("button", { name: "başlat" }).click();
  await startMenuItem(admin, "Denetim Günlüğü").click();
  const log = admin.getByRole("region", { name: "Denetim Günlüğü", exact: true });
  await expect(log).toBeVisible();

  for (const action of ["USER_CREATE", "MEMBER_ASSIGN", "PERM_SET_SCREEN", "FORCE_LOGOUT"]) {
    await log.getByRole("textbox", { name: "İşlem" }).fill(action);
    await expect(log.getByRole("row").filter({ hasText: action }).first()).toBeVisible();
  }
  // The permission switch happened twice (off, on).
  await log.getByRole("textbox", { name: "İşlem" }).fill("PERM_SET_SCREEN");
  await expect(log.getByText("2 kayıt", { exact: true })).toBeVisible();

  expect(adminErrors).toEqual([]);
});
