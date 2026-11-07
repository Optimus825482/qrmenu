import type { Page } from "@playwright/test";
import { answer, appWindow } from "./definitionsUi";
import { expect, login, resetAndSeed, test } from "./fixtures";
import { MR, newContextPage, openAdminShell } from "./menuUi";

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

test("admin listesi açıkken kat.mr 2 sn içinde görünür; zorla çıkış kat.mr sekmesini /giris yapar ve satırı düşürür @kabul-3", async ({
  page,
  browser,
}) => {
  const errors = trackErrors(page);
  await openAdminShell(page);
  const win = await appWindow(page, "Online Kullanıcılar", MR.name);
  await expect(win.getByRole("row", { name: /kat\.mr/ })).toHaveCount(0);

  const kat = await newContextPage(browser);
  try {
    await login(kat, "kat.mr");
    await expect(kat).toHaveURL(/\/kat$/);
    // The grid follows session.changed live: no reload on the admin side.
    const row = win.getByRole("row", { name: /kat\.mr/ });
    await expect(row).toBeVisible({ timeout: 2000 });
    await expect(row).toContainText("Çevrimiçi");

    // Force logout is a dangerous action: always asked. The kat tab's SSE stream gets session.closed → /giris.
    await row.click();
    await win.getByRole("button", { name: "Zorla çıkış" }).click();
    await answer(page, "Zorla çıkış", "Evet");
    await expect(kat).toHaveURL(/\/giris/, { timeout: 5000 });
    await expect(row).toHaveCount(0, { timeout: 5000 });

    // The closed session stays closed: a server-rendered /kat sends the tab back to the login page.
    await kat.goto("/kat");
    await expect(kat).toHaveURL(/\/giris/);
  } finally {
    await kat.context().close();
  }

  expect(errors).toEqual([]);
});
