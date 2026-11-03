import { randomUUID } from "node:crypto";
import type { Page } from "@playwright/test";
import { Client } from "pg";
import { e2eDatabaseUrl } from "./e2eDb";
import { node, row, startMenuItem } from "./definitionsUi";
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
    // Keeps the seen-tour record (the seed marks every tour seen): only the acknowledgement goes.
    c.query(
      `UPDATE users SET prefs = jsonb_set(COALESCE(prefs, '{}'::jsonb), '{guide}', COALESCE(prefs->'guide', '{}'::jsonb) - 'welcomeSeenHash')
        WHERE username = $1`,
      [username],
    ),
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

async function openUsersWindow(page: Page) {
  const title = "Kullanıcı Yönetimi";
  const window = page.getByRole("region", { name: title, exact: true });
  if (!(await window.isVisible())) {
    await page.getByRole("button", { name: "başlat", exact: true }).press("Enter");
    await startMenuItem(page, title).press("Enter");
  }
  await expect(window).toBeVisible();
  return window;
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
  await expect(page.getByRole("main").getByRole("button")).toHaveCount(1);
  await expect(page.getByRole("button", { name: /Profil menüsü/ })).toHaveCount(0);
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

    const guest = await page.request.post(`/api/q/${room101Token}/mybar`, {
      data: {
        idempotencyKey: randomUUID(),
        locale: "tr",
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
    const users = await openUsersWindow(admin);
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

// Tur motoru ve "?" yardım (P-UX-11). Seed her ekran turunu "görüldü" yazar; bu bölüm gerektiğinde siler.
test.describe("ekran turu ve yardım", () => {
  test.beforeAll(() => {
    process.env.SEED_MINIBAR = "1";
    try {
      resetAndSeed({ guestMenu: true });
    } finally {
      delete process.env.SEED_MINIBAR;
    }
  });

  /** Removes the "seen" record of one screen so its tour is offered again. */
  async function forgetTour(username: string, screen: string): Promise<void> {
    await withDb((c) =>
      c.query(
        `UPDATE users SET prefs = jsonb_set(prefs, '{guide,seen}', (prefs->'guide'->'seen') - $2::text) WHERE username = $1`,
        [username, screen],
      ),
    );
  }

  async function seenTourVersion(username: string, screen: string): Promise<number> {
    return withDb(async (c) => {
      const result = await c.query<{ version: number | null }>(
        `SELECT (prefs->'guide'->'seen'->>$2)::int AS version FROM users WHERE username = $1`,
        [username, screen],
      );
      return result.rows[0]?.version ?? 0;
    });
  }

  const tour = (page: Page) => page.getByRole("dialog", { name: "Ekran turu" });
  const help = (page: Page) => page.getByTestId("help-sheet");

  /** Walks a running tour to its end and returns the step titles it showed. */
  async function walkTour(page: Page): Promise<string[]> {
    const titles: string[] = [];
    await expect(tour(page)).toBeVisible({ timeout: 10_000 });
    for (let guard = 0; guard < 8; guard++) {
      titles.push((await tour(page).locator(".guide-tour-title").innerText()).trim());
      const finish = tour(page).getByRole("button", { name: "Bitir" });
      if (await finish.isVisible()) {
        await finish.click();
        break;
      }
      await tour(page).getByRole("button", { name: "İleri" }).click();
    }
    await expect(tour(page)).toHaveCount(0);
    return titles;
  }

  async function seriousViolations(page: Page, selector: string): Promise<string[]> {
    const { default: AxeBuilder } = await import("@axe-core/playwright");
    const result = await new AxeBuilder({ page }).include(selector).analyze();
    return result.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => v.id);
  }

  test("kat.mr /kat ilk açılışta tur kendiliğinden başlar; Esc kapatır; yenileyince tekrar açılmaz", async ({ browser }) => {
    await forgetTour("kat.mr", "MB-KAT");
    const page = await newContextPage(browser);
    await login(page, "kat.mr");
    await expect(page).toHaveURL(/\/kat$/);
    await expect(tour(page)).toBeVisible({ timeout: 10_000 });
    await expect(tour(page).locator(".guide-tour-count")).toHaveText(/^1\/\d/);
    expect(await seriousViolations(page, '[data-testid="coach-marks"]')).toEqual([]);
    await expect(tour(page).getByRole("button", { name: "İleri" })).toBeFocused();
    await page.keyboard.press("ArrowRight");
    await expect(tour(page).locator(".guide-tour-count")).toHaveText(/^2\/\d/);
    await page.keyboard.press("Escape");
    await expect(tour(page)).toHaveCount(0);
    await expect.poll(() => seenTourVersion("kat.mr", "MB-KAT")).toBeGreaterThan(0);

    await page.reload();
    await expect(page.locator("#icerik")).toBeVisible();
    await expect(tour(page)).not.toBeVisible({ timeout: 3_000 });
    await page.context().close();
  });

  test("tur yinelenince Esc odağı başlatan öğeye geri verir", async ({ browser }) => {
    const page = await newContextPage(browser);
    await login(page, "kat.mr");
    await expect(page).toHaveURL(/\/kat$/);
    const avatar = page.getByRole("button", { name: /Profil menüsü/ });
    await avatar.focus();
    // The page may still be hydrating when the request is sent: repeat it until the host hears it.
    await expect(async () => {
      await page.evaluate(() => window.dispatchEvent(new CustomEvent("merit:guide", { detail: { type: "tour" } })));
      await expect(tour(page)).toBeVisible({ timeout: 1_500 });
    }).toPass({ timeout: 15_000 });
    await expect(tour(page).getByRole("button", { name: "İleri" })).toBeFocused(); // key handlers are attached
    await page.keyboard.press("Escape");
    await expect(tour(page)).toHaveCount(0);
    await expect(avatar).toBeFocused();
    await page.context().close();
  });

  test("hoş geldin onaylanmadan tur başlamaz", async ({ browser }) => {
    await forgetWelcome("kat2.mr");
    await forgetTour("kat2.mr", "MB-KAT");
    const page = await newContextPage(browser);
    await login(page, "kat2.mr");
    await expect(page).toHaveURL(/\/erisimim\?hos-geldin=1$/);
    await expect(tour(page)).not.toBeVisible({ timeout: 2_500 });
    await page.getByRole("button", { name: "Anladım" }).click();
    await expect(page).toHaveURL(/\/kat$/);
    await expect(tour(page)).toBeVisible({ timeout: 10_000 });
    await page.context().close();
  });

  test("depo /depo/stok: Havuza giriş adımı depo.cok için var, kat.mr için (yalnız V,D) yok", async ({ browser }) => {
    for (const [user, expectStep] of [
      ["depo.cok", true],
      ["kat.mr", false],
    ] as const) {
      await forgetTour(user, "MB-ZIM");
      const page = await newContextPage(browser);
      await login(page, user);
      // depo.cok works in two hotels and picks one first.
      if (user === "depo.cok") await page.getByRole("button", { name: /Minibar/ }).first().click();
      await expect(page).not.toHaveURL(/\/giris|\/secim/);
      await page.goto("/depo/stok");
      const titles = await walkTour(page);
      if (expectStep) expect(titles).toContain("Havuza giriş");
      else expect(titles).not.toContain("Havuza giriş");
      await page.context().close();
    }
  });

  test("/garson: kapalı sekmedeki hedefler atlanır, sayaç kalan adım sayısını gösterir", async ({ browser }) => {
    await forgetTour("garson.havuz", "QS-KUY");
    const page = await openStaff(browser, "garson.havuz");
    await expect(page).toHaveURL(/\/garson/);
    await expect(tour(page)).toBeVisible({ timeout: 10_000 });
    const counter = (await tour(page).locator(".guide-tour-count").innerText()).trim();
    const total = Number(counter.split("/")[1]);
    expect(total).toBeGreaterThan(0);
    expect(total).toBeLessThan(4); // QS-KUY defines four steps; the tables tab is closed
    await page.keyboard.press("Escape");
    await page.context().close();
  });

  test("kasa: ? düğmesi yardım sayfasını açar; Turu tekrar oynat çalışır; Yazdır window.print çağırır; axe temiz", async ({ browser }) => {
    const page = await newContextPage(browser);
    await page.addInitScript(`window.__printed = 0; window.print = () => { window.__printed++; };`);
    await login(page, "kasa.havuz");
    await page.getByRole("button", { name: /Havuz Bar/ }).click();
    await expect(page).toHaveURL(/\/kasa$/);
    const trigger = page.getByRole("button", { name: "Yardım", exact: true });
    const box = await trigger.boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);
    await trigger.click();
    await expect(help(page)).toBeVisible();
    await expect(help(page)).toContainText("Burada yapabileceklerin");
    await expect(help(page).getByTestId("help-abilities").locator("li").first()).toBeVisible();
    expect(await seriousViolations(page, '[data-testid="help-sheet"]')).toEqual([]);

    await help(page).getByRole("button", { name: "Yazdır" }).click();
    expect(await page.evaluate(() => (window as unknown as { __printed: number }).__printed)).toBe(1);

    await help(page).getByRole("button", { name: "Turu tekrar oynat" }).click();
    await expect(help(page)).toHaveCount(0);
    await expect(tour(page)).toBeVisible();
    await expect(tour(page).getByRole("button", { name: "İleri" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(tour(page)).toHaveCount(0);
    await page.context().close();
  });

  test("personel profil menüsünde Yardım var; yetkisiz eylem anlatılmaz; ayar değişince yardım metni yenilenir", async ({ browser }) => {
    // R-KAT may only view and change on the pool screen: the "new entry" sentence is not told to them.
    const kat = await newContextPage(browser);
    await login(kat, "kat.mr");
    await expect(kat).toHaveURL(/\/kat$/);
    await kat.goto("/depo/stok");
    await kat.getByRole("button", { name: /Profil menüsü/ }).click();
    await kat.getByRole("menuitem", { name: "Yardım" }).click();
    await expect(help(kat).getByTestId("help-abilities")).toContainText("Ürünün kritik seviyesini güncellersin.");
    await expect(help(kat)).not.toContainText("Havuza yeni giriş yaparsın.");
    await expect(help(kat)).not.toContainText("Yeni kayıt açabilirsin");
    await expect(help(kat)).not.toContainText("önce Ek Talep ile stok iste");
    await kat.context().close();

    const depo = await newContextPage(browser);
    await login(depo, "depo.cok");
    await depo.getByRole("button", { name: /Minibar/ }).first().click();
    await expect(depo).toHaveURL(/\/depo\/stok$/);
    await depo.getByRole("button", { name: /Profil menüsü/ }).click();
    await depo.getByRole("menuitem", { name: "Yardım" }).click();
    await expect(help(depo).getByTestId("help-abilities")).toContainText("Havuza yeni giriş yaparsın.");
    await expect(help(depo)).toContainText("önce Ek Talep ile stok iste");
    await depo.context().close();

    // Setting values show as sentences and follow the current value.
    const page = await newContextPage(browser);
    await login(page, "kat.mr");
    await expect(page).toHaveURL(/\/kat$/);
    await page.goto("/kat/dnd");
    const open = async () => {
      await page.getByRole("button", { name: /Profil menüsü/ }).click();
      await page.getByRole("menuitem", { name: "Yardım" }).click();
      await expect(help(page)).toBeVisible();
    };
    await open();
    await expect(help(page).getByTestId("help-settings")).toContainText("DND, 2 kontrolde tamamlanır");
    await expect(help(page).getByRole("button", { name: "Kapat" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(help(page)).toHaveCount(0);
    await withDb(async (c) => {
      await c.query(`DELETE FROM settings WHERE key = 'dnd.minChecks' AND hotel_id IS NULL`);
      await c.query(
        `INSERT INTO settings (id, hotel_id, key, value, updated_at) VALUES (gen_random_uuid()::text, NULL, 'dnd.minChecks', '3'::jsonb, now())`,
      );
    });
    await open();
    await expect(help(page).getByTestId("help-settings")).toContainText("DND, 3 kontrolde tamamlanır");
    await withDb((c) => c.query(`DELETE FROM settings WHERE key = 'dnd.minChecks' AND hotel_id IS NULL`));
    await page.context().close();
  });

  test("XP: pencerede F1 yardım panelini açar (tarayıcı yardımı değil); Yardım menüsünden Turu başlat", async ({ browser }) => {
    await forgetTour("admin", "CR-KUL");
    const page = await newContextPage(browser);
    await openAdminShell(page);
    const users = await openUsersWindow(page);
    // First visit to the window: the tour starts by itself; close it before driving the window.
    await expect(tour(page)).toBeVisible({ timeout: 10_000 });
    await expect(tour(page).getByRole("button", { name: "İleri" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(tour(page)).toHaveCount(0);
    await users.getByRole("searchbox").focus();
    await page.evaluate(() => {
      (window as unknown as { __f1: boolean }).__f1 = false;
      window.addEventListener("keydown", (e) => {
        if (e.key === "F1") (window as unknown as { __f1: boolean }).__f1 = e.defaultPrevented;
      });
    });
    await page.keyboard.press("F1");
    await expect(help(page)).toBeVisible();
    expect(await page.evaluate(() => (window as unknown as { __f1: boolean }).__f1)).toBe(true);
    expect(await seriousViolations(page, '[data-testid="help-sheet"]')).toEqual([]);
    await expect(help(page).getByRole("button", { name: "Kapat" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(help(page)).toHaveCount(0);

    await users.getByRole("menuitem", { name: "Yardım" }).click();
    await page.getByRole("menuitem", { name: "Turu başlat" }).click();
    await expect(tour(page)).toBeVisible();
    // XP density: 24 px controls.
    const next = await tour(page).getByRole("button", { name: "İleri" }).boundingBox();
    expect(next!.height).toBeGreaterThanOrEqual(24);
    await tour(page).getByRole("button", { name: "Turu kapat" }).click();
    await expect(tour(page)).toHaveCount(0);

    // Closing recorded the tour as seen: it does not start by itself again.
    await expect.poll(() => seenTourVersion("admin", "CR-KUL")).toBeGreaterThan(0);
    await page.reload();
    await openUsersWindow(page);
    await expect(tour(page)).not.toBeVisible({ timeout: 2_000 });
    await page.context().close();
  });
});
