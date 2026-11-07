import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { Client } from "pg";
import type { Locator, Page } from "@playwright/test";
import { acknowledge, answer, findStartItem } from "./definitionsUi";
import { e2eDatabaseUrl } from "./e2eDb";
import { expect, login, resetAndSeed, test } from "./fixtures";
import { startSmtpStub } from "../helpers/smtpStub";

// P7 acceptance (T12), e-mail chain: SMTP settings in Denetim Masası -> test mail -> the 08:00/08:05 daily report
// pipeline (enqueue + queue worker, driven out-of-process by helpers/run-mail-jobs.ts) -> delivery log -> manual retry.
// The app server runs in another process, so the SMTP stub lives here and the server reaches it through the
// `smtp.*` setting rows written by the spec itself (host 127.0.0.1, the stub's port).
test.describe.configure({ mode: "serial" });

let stub: Awaited<ReturnType<typeof startSmtpStub>>;

test.beforeAll(async () => {
  stub = await startSmtpStub("accept");
  process.env.SEED_MINIBAR = "1";
  process.env.SEED_REPORTS = "1";
  process.env.SEED_MAIL = "1";
  try {
    resetAndSeed();
  } finally {
    delete process.env.SEED_MINIBAR;
    delete process.env.SEED_REPORTS;
    delete process.env.SEED_MAIL;
  }
});

test.afterAll(async () => {
  await stub?.close();
});

async function sql<T = Record<string, unknown>>(text: string): Promise<T[]> {
  const client = new Client({ connectionString: e2eDatabaseUrl() });
  await client.connect();
  try {
    return (await client.query(text)).rows as T[];
  } finally {
    await client.end();
  }
}

const execFileAsync = promisify(execFile);

type JobsOutput = { enqueued: Record<string, { enqueued: number }>; processed: { claimed: number; SENT: number } | null };

/**
 * Runs the daily mail jobs once in a separate process against the e2e database (see helpers/run-mail-jobs.ts).
 * Asynchronous on purpose: the SMTP stub lives in this process and must keep answering while the worker sends.
 */
async function runMailJobs(...args: string[]): Promise<JobsOutput> {
  const root = path.resolve(__dirname, "../..");
  const { stdout: out } = await execFileAsync(
    process.execPath,
    [path.join(root, "node_modules/tsx/dist/cli.mjs"), path.join(__dirname, "helpers/run-mail-jobs.ts"), ...args],
    { cwd: root, env: { ...process.env, E2E_DATABASE_URL: e2eDatabaseUrl() } },
  );
  return JSON.parse(out.trim().split("\n").pop()!) as JobsOutput;
}

const panelWindow = (page: Page) => page.locator('.xp-window[aria-label="Denetim Masası"].is-active');

async function openControlPanel(page: Page): Promise<Locator> {
  await page.getByRole("button", { name: "başlat" }).click();
  await (await findStartItem(page, "Denetim Masası")).click();
  await expect(panelWindow(page)).toBeVisible();
  return panelWindow(page);
}

/** Saves one system-scope setting row of the open Sistem tab. */
async function saveRow(page: Page, win: Locator, label: string, value: string, kind: "text" | "select" = "text") {
  const row = win.getByRole("group", { name: label, exact: true });
  const control = row.getByLabel(label, { exact: true });
  if (kind === "select") await control.selectOption({ label: value });
  else await control.fill(value);
  await row.getByRole("button", { name: "Kaydet" }).click();
  await answer(page, "Ayarı kaydet", "Evet");
  await acknowledge(page);
}

const logRows = (win: Locator) => win.locator(".xp-mail-grid").getByRole("row");

test("Denetim Masası: SMTP ayarları kaydedilir, parola şifreli saklanır ve maskelenir; 'Test gönder' kayda GONDERILDI düşer", async ({ page }) => {
  await login(page, "admin");
  await expect(page).toHaveURL(/\/admin$/);
  const win = await openControlPanel(page);

  // Before any setting: the E-posta panel says SMTP is missing.
  await win.getByRole("tab", { name: "E-posta" }).click();
  await expect(win.getByTestId("mail-smtp-missing")).toBeVisible();

  await win.getByRole("tab", { name: "QR Menü ve Sistem" }).click();
  await expect(win.getByLabel("Kapsam")).toHaveValue("");
  await saveRow(page, win, "SMTP sunucusu", "127.0.0.1");
  await saveRow(page, win, "SMTP bağlantı noktası", String(stub.port));
  await saveRow(page, win, "SMTP güvenliği", "Şifresiz", "select");
  await saveRow(page, win, "Gönderen e-posta adresi", "noreply@merit.test");

  // Sealed password: stored as an `enc:v1:` envelope, the field shows only the mask and never the clear text.
  const passwordRow = win.getByRole("group", { name: "SMTP parolası", exact: true });
  await saveRow(page, win, "SMTP parolası", "StubPass!2026");
  await expect(passwordRow.getByLabel("SMTP parolası", { exact: true })).toHaveValue("");
  await expect(passwordRow.getByLabel("SMTP parolası", { exact: true })).toHaveAttribute("placeholder", /Kayıtlı/);
  const [stored] = await sql<{ v: string }>(`SELECT value #>> '{}' AS v FROM settings WHERE key = 'smtp.password' AND hotel_id IS NULL`);
  expect(stored.v).toMatch(/^enc:v1:/);
  expect(stored.v).not.toContain("StubPass");
  await expect(win).not.toContainText("StubPass!2026");

  // The stub takes no authentication: drop the password again (user and password only count as a pair).
  await passwordRow.getByRole("button", { name: "Değeri temizle" }).click();
  await answer(page, "Ayarı kaydet", "Evet");
  await acknowledge(page);

  await win.getByRole("tab", { name: "E-posta" }).click();
  const smtp = win.getByTestId("mail-smtp");
  await expect(smtp).toContainText(`127.0.0.1:${stub.port}`);
  await expect(smtp).toContainText("Sistem ayarı");

  await win.getByRole("button", { name: "Test gönder" }).click();
  await expect(win.getByRole("status").filter({ hasText: "Test e-postası" })).toContainText("gönderildi");
  await expect.poll(() => stub.received.length).toBe(1);
  expect(stub.received[0].subject).toMatch(/^Merit OS test e-postası/);
  await expect(logRows(win).filter({ hasText: "Test" }).filter({ hasText: "Gönderildi" })).toHaveCount(1);
  const [row] = await sql<{ status: string; kind: string }>(`SELECT status, kind FROM email_logs ORDER BY created_at DESC LIMIT 1`);
  expect(row).toEqual({ status: "GONDERILDI", kind: "TEST" });
});

test("Günlük raporlar: opt-in müdüre görev ve sarfiyat iletisi ekleriyle gider; opt-out kullanıcıya satır oluşmaz; ikinci koşu tekrar göndermez", async ({ page }) => {
  const before = stub.received.length;
  const first = await runMailJobs("--template=ALL");
  expect(first.enqueued.GOREV.enqueued).toBe(1);
  expect(first.enqueued.SARFIYAT.enqueued).toBe(1);
  expect(first.processed?.SENT).toBe(2);

  const mails = stub.received.slice(before);
  expect(mails).toHaveLength(2);
  for (const mail of mails) {
    expect(JSON.stringify(mail.to)).toContain("mudur.mr@merit.test");
    expect(JSON.stringify(mail.to)).not.toContain("depo.mr@merit.test");
  }
  const gorev = mails.find((m) => /Günlük Görev Raporu/.test(m.subject ?? ""));
  const sarfiyat = mails.find((m) => /Günlük Sarfiyat Raporu/.test(m.subject ?? ""));
  expect(gorev, "görev iletisi").toBeTruthy();
  expect(sarfiyat, "sarfiyat iletisi").toBeTruthy();
  expect(gorev!.attachments.map((a) => a.filename)).toEqual([expect.stringMatching(/^gorev-ROYAL-\d{4}-\d{2}-\d{2}\.xlsx$/)]);
  expect(sarfiyat!.attachments.map((a) => a.filename).sort()).toEqual([
    expect.stringMatching(/^sarfiyat-ROYAL-\d{4}-\d{2}-\d{2}\.pdf$/),
    expect.stringMatching(/^sarfiyat-ROYAL-\d{4}-\d{2}-\d{2}\.xlsx$/),
  ]);

  // Same day again: the per-user dedupe key leaves nothing to send.
  const second = await runMailJobs("--template=ALL");
  expect(second.enqueued.GOREV.enqueued + second.enqueued.SARFIYAT.enqueued).toBe(0);
  expect(stub.received.length).toBe(before + 2);

  // Delivery log in the panel.
  await login(page, "admin");
  const win = await openControlPanel(page);
  await win.getByRole("tab", { name: "E-posta" }).click();
  const grid = win.locator(".xp-mail-grid");
  await expect(logRows(win).filter({ hasText: "mudur.mr@merit.test" }).filter({ hasText: "Gönderildi" })).toHaveCount(2);
  await expect(grid.getByText("Görev raporu", { exact: true })).toBeVisible();
  await expect(grid.getByText("Sarfiyat raporu", { exact: true })).toBeVisible();
  await expect(grid.getByText("depo.mr@merit.test")).toHaveCount(0);
  const [{ n }] = await sql<{ n: number }>(`SELECT count(*)::int AS n FROM email_logs WHERE "to" = 'depo.mr@merit.test'`);
  expect(n).toBe(0);
});

test("E-posta paneli: HATA satırı 'Tekrar kuyruğa al' ile kuyruğa döner ve bir sonraki koşuda gönderilir", async ({ page }) => {
  await sql(`UPDATE email_logs SET status = 'HATA', attempts = 5, error = 'zorlanan hata' WHERE template = 'GOREV'`);
  const before = stub.received.length;

  await login(page, "admin");
  const win = await openControlPanel(page);
  await win.getByRole("tab", { name: "E-posta" }).click();
  const failed = logRows(win).filter({ hasText: "zorlanan hata" });
  await expect(failed).toHaveCount(1);
  await expect(failed).toContainText("Hata");
  await failed.getByRole("button", { name: "Tekrar kuyruğa al" }).click();
  // Simple actions need no confirmation box by default; the notice reports the result.
  await acknowledge(page, /tekrar kuyruğa alındı/);
  await expect(logRows(win).filter({ hasText: "Görev raporu" }).filter({ hasText: "Bekliyor" })).toHaveCount(1);

  const run = await runMailJobs("--only=process");
  expect(run.processed?.SENT).toBe(1);
  expect(stub.received.length).toBe(before + 1);
  await win.getByRole("button", { name: "Yenile" }).click();
  await expect(logRows(win).filter({ hasText: "Görev raporu" }).filter({ hasText: "Gönderildi" })).toHaveCount(1);
});
