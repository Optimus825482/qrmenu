import { Client } from "pg";
import { e2eDatabaseUrl } from "./e2eDb";
import { expect, login, resetAndSeed, test } from "./fixtures";

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
