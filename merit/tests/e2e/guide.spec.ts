import { randomUUID } from "node:crypto";
import type { Page } from "@playwright/test";
import { Client } from "pg";
import { e2eDatabaseUrl } from "./e2eDb";
import { appWindow, node, row } from "./definitionsUi";
import { expect, login, resetAndSeed, test } from "./fixtures";
import { newContextPage, openAdminShell } from "./menuUi";
import { approveOrder, openStaff, railLink, sendGuestOrder } from "./opsUi";

// Erişimim (P-UX-10): the specs share one database state and run in order.
test.describe.configure({ mode: "serial" });

test.beforeAll(() => {
  resetAndSeed();
});

async function withDb<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: e2eDatabaseUrl() });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

/** seed-e2e pre-acknowledges everybody; these tests need the real first-login state. */
async function forgetWelcome(username: string): Promise<void> {
  await withDb((c) =>
    c.query(`UPDATE users SET prefs = COALESCE(prefs, '{}'::jsonb) - 'guide' WHERE username = $1`, [username]),
  );
}

/** Screen codes a role may view in ROYAL (system-wide permission rows; CORE ignores module gates). */
async function viewable(roleCode: string): Promise<string[]> {
  return withDb(async (c) => {
    const res = await c.query<{ code: string }>(
      `SELECT s.code FROM app_screens s
         JOIN roles r ON r.code = $1
         JOIN role_screen_permissions p ON p.screen_id = s.id AND p.role_id = r.id AND p.hotel_id IS NULL AND p.can_view
        WHERE s.is_active
          AND (s.module_key = 'CORE' OR (
                EXISTS (SELECT 1 FROM role_module_accesses a WHERE a.role_id = r.id AND a.module_key = s.module_key AND a.hotel_id IS NULL AND a.enabled)
            AND EXISTS (SELECT 1 FROM hotel_modules m JOIN hotels h ON h.id = m.hotel_id WHERE h.code = 'ROYAL' AND m.module_key = s.module_key AND m.enabled)))
        ORDER BY s.code`,
      [roleCode],
    );
    return res.rows.map((r) => r.code);
  });
}

async function cardCodes(page: import("@playwright/test").Page): Promise<string[]> {
  const codes = await page.locator('[data-testid="access-screen"]').evaluateAll((els) =>
    els.map((e) => e.getAttribute("data-code") ?? ""),
  );
  return codes.sort();
}

test("kat.mr ilk girişte zorunlu Erişimim; Anladım /kat'a götürür; ikinci girişte özet çıkmaz", async ({ page, context }) => {
  await forgetWelcome("kat.mr");
  await login(page, "kat.mr");
  await expect(page).toHaveURL(/\/erisimim\?hos-geldin=1$/);

  await expect(page.getByTestId("access-greeting")).toContainText("Merhaba Test");
  await expect(page.getByTestId("access-greeting")).toContainText("Kat Sorumlusu");
  // Single screen, single button: no navigation, no profile menu, no links to leave through.
  await expect(page.getByRole("navigation")).toHaveCount(0);
  await expect(page.getByRole("link")).toHaveCount(0);
  await expect(page.getByRole("button")).toHaveCount(1);
  await expect(page.getByText(/göremediğin/i)).toHaveCount(0);

  // Only owned screens: the card count equals the viewable screens and nothing else is listed.
  expect(await cardCodes(page)).toEqual(await viewable("R-KAT"));
  await expect(page.locator('[data-code="MB-DOL"]')).toHaveCount(0);
  await expect(page.locator('[data-code="MB-ZIM"]')).toContainText("Ürünün kritik seviyesini güncellersin.");

  // Leaving the page without acknowledging brings the summary back on the next /baslat.
  await page.goto("/baslat");
  await expect(page).toHaveURL(/\/erisimim\?hos-geldin=1$/);

  await page.getByRole("button", { name: "Anladım" }).click();
  await expect(page).toHaveURL(/\/kat$/);

  await context.clearCookies();
  await page.goto("about:blank"); // end the landing page's in-flight loads so /giris is not aborted
  await login(page, "kat.mr");
  await expect(page).toHaveURL(/\/kat$/);
});

test("rolün yetkisi değişince (MB-DOL V) özet tekrar zorunlu olur", async ({ page }) => {
  await withDb(async (c) => {
    const updated = await c.query(
      `UPDATE role_screen_permissions SET can_view = true
        WHERE hotel_id IS NULL
          AND role_id = (SELECT id FROM roles WHERE code = 'R-KAT')
          AND screen_id = (SELECT id FROM app_screens WHERE code = 'MB-DOL')`,
    );
    if (updated.rowCount === 0) {
      await c.query(
        `INSERT INTO role_screen_permissions (id, role_id, screen_id, can_view, updated_at)
         SELECT gen_random_uuid()::text, r.id, s.id, true, now() FROM roles r, app_screens s
          WHERE r.code = 'R-KAT' AND s.code = 'MB-DOL'`,
      );
    }
  });
  await login(page, "kat.mr");
  await expect(page).toHaveURL(/\/erisimim\?hos-geldin=1$/);
  await expect(page.locator('[data-code="MB-DOL"]')).toHaveCount(1);
  expect(await cardCodes(page)).toEqual(await viewable("R-KAT"));
  await page.getByRole("button", { name: "Anladım" }).click();
  await expect(page).toHaveURL(/\/kat$/);
});

test("Erişimim sonradan isteğe bağlı açılır: Anladım yok, geri dönülür", async ({ page }) => {
  await login(page, "kat.mr");
  await expect(page).toHaveURL(/\/kat$/);
  await page.goto("/erisimim");
  await expect(page.getByRole("heading", { name: "Erişimim" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Anladım" })).toHaveCount(0);
  expect(await cardCodes(page)).toEqual(await viewable("R-KAT"));
  await page.getByRole("link", { name: "Geri dön" }).click();
  await expect(page).toHaveURL(/\/kat$/);

  // Already acknowledged: the mandatory URL has nothing left to ask and forwards on.
  await page.goto("/erisimim?hos-geldin=1");
  await expect(page).toHaveURL(/\/kat$/);
});

test("yönetici XP masaüstünde Erişimim penceresini görür, Anladım ile kapatır", async ({ page }) => {
  await forgetWelcome("admin");
  await login(page, "admin");
  await expect(page).toHaveURL(/\/admin$/);
  const win = page.getByTestId("access-window");
  await expect(win).toBeVisible();
  await expect(win.getByTestId("access-greeting")).toContainText("Merhaba");
  await win.getByRole("button", { name: "Anladım" }).click();
  await expect(win).toHaveCount(0);

  await page.reload();
  await expect(page.locator(".xp-shell")).toBeVisible();
  await expect(page.getByTestId("access-window")).toHaveCount(0);
});

// Günlük rutin kartları (P-UX-12) ve "Kullanıcıya göster" önizlemesi (P-UX-13).
test.describe("rutin kartları ve Kullanıcıya göster", () => {
  let room101Token = "";
  let suProductId = "";

  test.beforeAll(async () => {
    process.env.SEED_MINIBAR = "1";
    try {
      resetAndSeed({ guestMenu: true });
    } finally {
      delete process.env.SEED_MINIBAR;
    }
    await withDb(async (c) => {
      room101Token = (
        await c.query<{ qr_token: string }>(
          `SELECT r.qr_token FROM rooms r JOIN hotels h ON h.id = r.hotel_id WHERE h.code = 'ROYAL' AND r.number = '101' LIMIT 1`,
        )
      ).rows[0].qr_token;
      suProductId = (await c.query<{ id: string }>(`SELECT id FROM products WHERE name = 'Su' LIMIT 1`)).rows[0].id;
    });
  });

  const item = (page: Page, id: string) => page.locator(`[data-testid="routine-item"][data-item="${id}"]`);
  const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Nicosia" }).format(new Date());

  test("kat.mr Bugün: rutin kartı; MyBar talebi gelince madde işaretsiz, Gördüm sonrası kendiliğinden işaretlenir; elle işaret prefs'e yazılır", async ({ browser }) => {
    const page = await newContextPage(browser);
    await login(page, "kat.mr");
    await expect(page).toHaveURL(/\/kat$/);
    await page.goto("/kat/tavsiye-is-plani");
    const card = page.getByTestId("routine-card").first();
    await expect(card).toBeVisible();
    await expect(card).toContainText("Kat sorumlusunun günü");
    await expect(item(page, "mybar-yok")).toHaveAttribute("data-done", "true");
    await expect(item(page, "mybar-yok")).toContainText("otomatik");

    const guest = await page.request.post("/api/minibar/mybar/request", {
      data: {
        token: room101Token,
        idempotencyKey: randomUUID(),
        language: "tr",
        note: "Lütfen hızlıca su gönderin",
        items: [{ productId: suProductId, qty: 1 }],
      },
    });
    expect(guest.status(), await guest.text()).toBe(200);
    // Live (SSE), no reload: the pending request unticks the automatic item.
    await expect(item(page, "mybar-yok")).toHaveAttribute("data-done", "false", { timeout: 10_000 });
    const alertDialog = page.getByRole("alertdialog");
    await expect(alertDialog).toBeVisible({ timeout: 5_000 });
    await alertDialog.getByRole("button", { name: /Gördüm/ }).click();
    await expect(alertDialog).toHaveCount(0);
    await expect(item(page, "mybar-yok")).toHaveAttribute("data-done", "true", { timeout: 10_000 });

    // Manual item: optimistic tick, stored under prefs.guide.checklist[<today>].
    const manual = item(page, "gorevleri-ac");
    await expect(manual).toHaveAttribute("data-done", "false");
    await manual.getByRole("checkbox").click();
    await expect(manual).toHaveAttribute("data-done", "true");
    await expect
      .poll(async () =>
        withDb(async (c) => {
          const res = await c.query<{ ticks: string[] | null }>(
            `SELECT prefs->'guide'->'checklist'->$2 AS ticks FROM users WHERE username = $1`,
            ["kat.mr", today()],
          );
          return res.rows[0]?.ticks ?? [];
        }),
      )
      .toContain("gorevleri-ac");
    await page.reload();
    await expect(item(page, "gorevleri-ac")).toHaveAttribute("data-done", "true");
    await page.context().close();
  });

  test("depo.mr /depo: rutin kartı yalnız yetkili ekranlara bağlanır", async ({ browser }) => {
    const page = await newContextPage(browser);
    await login(page, "depo.mr");
    await expect(page).not.toHaveURL(/\/giris/);
    await page.goto("/depo");
    const card = page.getByTestId("routine-card");
    await expect(card).toContainText("Depo sorumlusunun günü");
    await expect(item(page, "doluluk-yuklendi")).toHaveAttribute("data-done", "false");
    const hrefs = await card.locator("a").evaluateAll((els) => els.map((e) => e.getAttribute("href") ?? ""));
    expect(hrefs.length).toBeGreaterThan(0);
    for (const href of hrefs) expect(href.startsWith("/")).toBe(true);
    await page.context().close();
  });

  test("kasa.havuz: son kuyruk siparişi onaylanınca 'Onay kuyruğu boş' işaretlenir", async ({ browser }) => {
    const guest = await newContextPage(browser);
    const order = await sendGuestOrder(guest);
    const cashier = await openStaff(browser, "kasa.havuz");
    await expect(cashier).toHaveURL(/\/kasa$/);
    await expect(item(cashier, "kuyruk-bos")).toHaveAttribute("data-done", "false");
    await approveOrder(cashier, order.orderNo);
    await railLink(cashier, "Masalar").click();
    await expect(item(cashier, "kuyruk-bos")).toHaveAttribute("data-done", "true", { timeout: 10_000 });
    await guest.context().close();
    await cashier.context().close();
  });

  test("admin: Kullanıcıya göster kat.mr'ın Erişimim sayfasıyla aynı ekranları gösterir; oturum çerezi değişmez; rol sekmesi", async ({ browser }) => {
    const kat = await newContextPage(browser);
    await login(kat, "kat.mr");
    await expect(kat).toHaveURL(/\/kat$/);
    await kat.goto("/erisimim");
    await expect(kat.getByTestId("access-screen").first()).toBeVisible();
    const own = await kat.getByTestId("access-screen").allInnerTexts();
    expect(own.length).toBeGreaterThan(0);
    await kat.context().close();

    const admin = await newContextPage(browser);
    await openAdminShell(admin);
    const cookieKey = async () => (await admin.context().cookies()).map((c) => `${c.name}=${c.value}`).sort().join(";");
    const before = await cookieKey();
    const users = await appWindow(admin, "Kullanıcı Yönetimi");
    await users.getByRole("searchbox").fill("kat.mr");
    await row(users, "kat.mr").click();
    await users.getByRole("button", { name: "Kullanıcıya göster" }).click();
    const dialog = admin.getByTestId("access-preview-dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("Bu bir önizlemedir; oturum açılmaz.");
    await expect(dialog.getByTestId("access-screen").first()).toBeVisible();
    expect(await dialog.getByTestId("access-screen").allInnerTexts()).toEqual(own);
    await expect(dialog.getByTestId("access-preview-landing-screen")).toContainText("/kat");
    await dialog.getByRole("button", { name: "Kapat" }).last().click();
    await expect(dialog).toHaveCount(0);
    expect(await cookieKey()).toBe(before);
    const audits = await withDb((c) => c.query(`SELECT 1 FROM audit_logs WHERE action = 'YETKI_ONIZLEME' AND entity = 'User'`));
    expect(audits.rowCount).toBeGreaterThanOrEqual(1);

    // "Bu rol ne görür?" tab of the permission matrix: same summary, no person.
    await node(users, "Yetki Matrisi").click();
    await users.getByRole("tab", { name: "Bu rol ne görür?" }).click();
    const panel = users.getByTestId("role-preview");
    await users.getByLabel("Rol", { exact: true }).selectOption({ label: "R-KAT — Kat Sorumlusu" });
    await panel.getByLabel("Otel").selectOption({ label: "Merit Royal" });
    await expect(panel.getByTestId("access-greeting")).toContainText("Kat Sorumlusu");
    await expect(panel.locator('[data-code="MB-ZIM"]')).toBeVisible();
    await expect(panel.locator('[data-code="MB-DOL"]')).toHaveCount(0);
    await admin.context().close();
  });
});
