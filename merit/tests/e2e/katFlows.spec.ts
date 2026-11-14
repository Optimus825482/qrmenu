import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { e2eDatabaseUrl } from "./e2eDb";
import { expect, login, resetAndSeed, test } from "./fixtures";
import { newContextPage } from "./menuUi";

test.describe.configure({ mode: "serial" });
test.use({ locale: "tr-TR" });

type SeedIds = {
  room101Id: string;
  room101Token: string;
  suProductId: string;
  hotelId: string;
};

let seedIds: SeedIds;

async function withDb<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: e2eDatabaseUrl() });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

test.beforeAll(async () => {
  process.env.SEED_MINIBAR = "1";
  try {
    resetAndSeed();
  } finally {
    delete process.env.SEED_MINIBAR;
  }

  seedIds = await withDb(async (c) => {
    const roomRes = await c.query<{ id: string; qr_token: string; hotel_id: string }>(
      `SELECT r.id, r.qr_token, r.hotel_id
         FROM rooms r
         JOIN hotels h ON h.id = r.hotel_id
        WHERE h.code = 'ROYAL' AND r.number = '101'
        LIMIT 1`,
    );
    const suRes = await c.query<{ id: string }>(
      `SELECT id FROM products WHERE name = 'Su' LIMIT 1`,
    );
    return {
      room101Id: roomRes.rows[0].id,
      room101Token: roomRes.rows[0].qr_token,
      hotelId: roomRes.rows[0].hotel_id,
      suProductId: suRes.rows[0].id,
    };
  });
});

test("1. kat sorumlusu oda kontrolünde +2 tek dokunuşla ekler ve Geri al ile geri alır", async ({ browser }) => {
  const page = await newContextPage(browser);
  await login(page, "kat.mr");
  await expect(page).toHaveURL(/\/(kat|erisimim)/);
  if (/erisimim/.test(page.url())) {
    await page.getByRole("button", { name: "Anladım" }).click();
  }
  await expect(page).toHaveURL(/\/kat$/);

  await page.goto(`/kat/oda-kontrol/${seedIds.room101Id}`);
  const row = page.getByTestId("product-row-Su");
  await expect(row).toBeVisible();
  await expect(page.getByTestId("added-today-Su")).toContainText("Bugün eklenen: 0");

  await page.getByRole("button", { name: "Su +2" }).click();
  await expect(page.getByTestId("added-today-Su")).toContainText("Bugün eklenen: 2");

  const statusToast = page.getByRole("status").filter({ hasText: "+2 eklendi" });
  await expect(statusToast).toBeVisible();
  await statusToast.getByRole("button", { name: "Geri al" }).click();
  await expect(page.getByTestId("added-today-Su")).toContainText("Bugün eklenen: 0");

  await page.context().close();
});

test("1b. setup üstü adet: + ile açılan düğme ilave talep olarak kaydeder, Geri al ile geri alınır", async ({ browser }) => {
  const page = await newContextPage(browser);
  await login(page, "kat.mr");
  await expect(page).toHaveURL(/\/(kat|erisimim)/);
  if (/erisimim/.test(page.url())) {
    await page.getByRole("button", { name: "Anladım" }).click();
  }
  await expect(page).toHaveURL(/\/kat$/);

  await page.goto(`/kat/oda-kontrol/${seedIds.room101Id}`);
  await expect(page.getByTestId("product-row-Su")).toBeVisible();
  await expect(page.getByTestId("extra-today-Su")).toHaveCount(0);

  // Each press of the + icon opens one more numbered button; the first one above the setup is an "ilave" button.
  const extraButtons = page.getByRole("button", { name: /^Su \+\d+ \(ilave talep\)$/ });
  for (let i = 0; i < 20 && (await extraButtons.count()) === 0; i++) {
    await page.getByTestId("extra-plus-Su").click();
  }
  await expect(extraButtons.first()).toContainText("ilave");
  await extraButtons.first().click();

  const toast = page.getByRole("status").filter({ hasText: "1 adet ilave talep olarak kaydedildi" });
  await expect(toast).toBeVisible();
  await expect(page.getByTestId("extra-today-Su")).toContainText("İlave talep: 1");

  await toast.getByRole("button", { name: "Geri al" }).click();
  await expect(page.getByTestId("extra-today-Su")).toHaveCount(0);
  await expect(page.getByTestId("added-today-Su")).toContainText("Bugün eklenen: 0");

  await page.context().close();
});

test("2. misafir MyBar talebi gönderdiğinde kat sorumlusunda 1 s içinde PersistentMybarModal açılır, Gördüm ile kapanır", async ({
  browser,
}) => {
  const katPage = await newContextPage(browser);
  await login(katPage, "kat.mr");
  await expect(katPage).toHaveURL(/kat$|erisimim/);
  if (/erisimim/.test(katPage.url())) {
    await katPage.getByRole("button", { name: "Anladım" }).click();
  }
  await expect(katPage).toHaveURL(/\/kat$/);

  const guestRes = await katPage.request.post(`/api/q/${seedIds.room101Token}/mybar`, {
    data: {
      idempotencyKey: randomUUID(),
      locale: "tr",
      note: "Lütfen hızlıca su gönderin",
      items: [{ productId: seedIds.suProductId, qty: 1 }],
    },
  });
  expect(guestRes.status(), await guestRes.text()).toBe(200);

  const alertDialog = katPage.getByRole("alertdialog");
  await expect(alertDialog).toBeVisible({ timeout: 5_000 });
  await expect(alertDialog).toContainText("Oda 101");
  await expect(alertDialog.getByTestId("mybar-counter")).toHaveText("1/1");

  await alertDialog.getByRole("button", { name: /Gördüm/ }).click();
  await expect(alertDialog).toHaveCount(0);

  await katPage.context().close();
});

test("3. /kat/qr kamera izni reddedildiğinde oda numarası yazma kutusu görünür ve oda kontrolüne yönlendirir", async ({
  browser,
}) => {
  const page = await newContextPage(browser);
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "mediaDevices", {
      value: {
        getUserMedia: () => Promise.reject(new DOMException("Permission denied", "NotAllowedError")),
      },
      configurable: true,
    });
  });

  await login(page, "kat.mr");
  await expect(page).toHaveURL(/kat$|erisimim/);
  if (/erisimim/.test(page.url())) {
    await page.getByRole("button", { name: "Anladım" }).click();
  }
  await page.goto("/kat/qr");

  const input = page.getByLabel("QR kodu");
  await expect(input).toBeVisible();
  await input.fill("101");
  await page.getByRole("button", { name: "Aç", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/kat/oda-kontrol/${seedIds.room101Id}$`));

  await page.context().close();
});
