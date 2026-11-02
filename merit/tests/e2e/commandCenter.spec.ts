import { Client } from "pg";
import type { Page } from "@playwright/test";
import { e2eDatabaseUrl } from "./e2eDb";
import { expect, login, resetAndSeed, test } from "./fixtures";

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
const appWindow = (page: Page, name: string) => page.getByRole("region", { name, exact: true });

async function openAdmin(page: Page) {
  await login(page, "admin");
  await expect(page).toHaveURL(/\/admin$/);
  await expect(desktop(page)).toBeVisible();
}

async function openFromStart(page: Page, name: string) {
  await page.getByRole("button", { name: "başlat" }).click();
  await page
    .getByRole("menu", { name: "Başlat menüsü" })
    .getByRole("menuitem", { name, exact: true })
    .click();
}

/** Emits an event on the merit_events channel straight from the database (what publish() does). */
async function pgNotify(event: Record<string, unknown>): Promise<void> {
  const client = new Client({ connectionString: e2eDatabaseUrl() });
  await client.connect();
  try {
    await client.query("SELECT pg_notify('merit_events', $1)", [JSON.stringify(event)]);
  } finally {
    await client.end();
  }
}

async function adminId(): Promise<string> {
  const client = new Client({ connectionString: e2eDatabaseUrl() });
  await client.connect();
  try {
    const res = await client.query<{ id: string }>("SELECT id FROM users WHERE username = 'admin'");
    return res.rows[0].id;
  } finally {
    await client.end();
  }
}

test("Komuta Merkezi: 3 Otel KPI'sı; olay akışı pg_notify ile canlı güncellenir", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await openAdmin(page);
  await desktop(page).getByRole("button", { name: "Komuta Merkezi", exact: true }).dblclick();
  const win = appWindow(page, "Komuta Merkezi");
  await expect(win).toBeVisible();

  const hotels = win.getByTestId("kpi-hotels");
  await expect(hotels).toContainText("3");
  await expect(hotels).toContainText("Otel");
  await expect(win.getByTestId("kpi-online")).toContainText("1"); // the admin session itself
  await expect(win.getByText(/Son güncelleme \d{2}:\d{2}:\d{2}/)).toBeVisible();

  // Connected: the amber offline badge is gone.
  await expect(win.getByText("çevrimdışı")).toBeHidden();
  const feed = win.getByRole("list", { name: "Canlı Akış" });
  await expect(feed).toContainText("Henüz olay yok");

  const id = await adminId();
  await pgNotify({ type: "notification.created", userIds: [id], at: new Date().toISOString() });
  await expect(feed.getByText("notification.created")).toBeVisible({ timeout: 3000 });
  await expect(feed).not.toContainText("Henüz olay yok");

  expect(errors).toEqual([]);
});

test("Hakkında: iframe uygulaması 'F&B Command Center' sayfasını gösterir", async ({ page }) => {
  const errors = trackErrors(page);
  await openAdmin(page);
  await openFromStart(page, "Hakkında");
  const win = appWindow(page, "Hakkında");
  await expect(win).toBeVisible();

  const iframe = win.locator("iframe.xp-iframe");
  await expect(iframe).toHaveAttribute("src", "/admin/hakkinda?font=tahoma&theme=luna");
  await expect(iframe).toHaveAttribute("sandbox", "allow-same-origin allow-scripts allow-forms");

  const frame = page.frameLocator('iframe[title="Hakkında"]');
  await expect(frame.getByRole("heading", { name: "F&B Command Center" })).toBeVisible();
  await expect(frame.getByText("Bu pencere iframe uygulama sözleşmesinin örneğidir.")).toBeVisible();
  await expect(frame.getByText("0.1.0", { exact: true })).toBeVisible();

  // Framing protection (next.config.ts headers) still lets the shell frame its own pages.
  const response = await page.request.get("/admin/hakkinda");
  expect(response.headers()["x-frame-options"]).toBe("SAMEORIGIN");
  expect(response.headers()["content-security-policy"]).toContain("frame-ancestors 'self'");

  expect(errors).toEqual([]);
});

test("tek SSE bağlantısı: görev çubuğu ve iki Komuta Merkezi penceresi aynı EventSource'u paylaşır", async ({
  page,
}) => {
  const streams: string[] = [];
  page.on("request", (r) => {
    if (r.method() === "GET" && new URL(r.url()).pathname === "/api/sse") streams.push(r.url());
  });
  await openAdmin(page);
  await desktop(page).getByRole("button", { name: "Komuta Merkezi", exact: true }).dblclick();
  await openFromStart(page, "Komuta Merkezi");
  const windows = page.getByRole("region", { name: "Komuta Merkezi", exact: true });
  await expect(windows).toHaveCount(2);
  await expect(windows.nth(0).getByText("çevrimdışı")).toBeHidden();
  await expect(windows.nth(1).getByText("çevrimdışı")).toBeHidden();

  const id = await adminId();
  await pgNotify({ type: "notification.created", userIds: [id], at: new Date().toISOString() });
  for (const i of [0, 1]) {
    await expect(
      windows.nth(i).getByRole("list", { name: "Canlı Akış" }).getByText("notification.created"),
    ).toBeVisible({ timeout: 3000 });
  }
  expect(streams).toHaveLength(1);

  // Closing every window keeps the taskbar's subscription: still the same single stream.
  await windows.nth(1).getByRole("button", { name: "Kapat" }).click();
  await windows.nth(0).getByRole("button", { name: "Kapat" }).click();
  await expect(windows).toHaveCount(0);
  await page.waitForTimeout(500);
  expect(streams).toHaveLength(1);
});

test("/admin/hakkinda: oturumsuz → giriş; yönetim rolü dışı → /secim", async ({ page }) => {
  await page.goto("/admin/hakkinda");
  await expect(page).toHaveURL(/\/giris/);
  await login(page, "kat.mr");
  await expect(page).toHaveURL(/\/kat$/);
  await page.goto("/admin/hakkinda");
  await expect(page).toHaveURL(/\/secim$/);
});
