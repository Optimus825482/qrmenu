import { Client } from "pg";
import { e2eDatabaseUrl } from "./e2eDb";
import { expect, resetAndSeed, test } from "./fixtures";
import { openStaff, sendGuestOrder, tableTile } from "./opsUi";

test.describe.configure({ mode: "serial" });
test.use({ locale: "tr-TR" });

async function sql(text: string, values: unknown[] = []): Promise<void> {
  const client = new Client({ connectionString: e2eDatabaseUrl() });
  await client.connect();
  try {
    await client.query(text, values);
  } finally {
    await client.end();
  }
}

test.beforeAll(async () => {
  resetAndSeed({ guestMenu: true });
  // Fiyatlar misafir menüsünde görünsün: sipariş kalemlerinde birim fiyat saklanır.
  await sql(`update outlets set price_display = 'SHOW' where name = 'Havuz Bar'`);
});

test("kasa tutarı outletin para birimine uyar: EUR -> euro, TRY -> lira", async ({ page, browser }) => {
  await sendGuestOrder(page);
  const cashier = await openStaff(browser, "kasa.havuz");
  await expect(tableTile(cashier, "M1")).toContainText("€12,00");
  await expect(tableTile(cashier, "M1")).not.toContainText("₺");

  // K3: the currency is the outlet's own field (chosen with its price display).
  await sql(`update outlets set currency = 'TRY' where name = 'Havuz Bar'`);
  await cashier.reload();
  await expect(tableTile(cashier, "M1")).toContainText("₺12,00");
  await expect(tableTile(cashier, "M1")).not.toContainText("€");
});
