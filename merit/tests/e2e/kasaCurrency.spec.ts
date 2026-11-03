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

test("kasa tutarı otelin price.currency ayarına uyar: EUR -> euro, TRY -> lira", async ({ page, browser }) => {
  await sendGuestOrder(page);
  const cashier = await openStaff(browser, "kasa.havuz");
  await expect(tableTile(cashier, "M1")).toContainText("€12,00");
  await expect(tableTile(cashier, "M1")).not.toContainText("₺");

  await sql(
    `insert into settings (id, hotel_id, key, value, updated_at)
     select gen_random_uuid()::text, h.id, 'price.currency', '"TRY"'::jsonb, now()
       from hotels h join outlets o on o.hotel_id = h.id where o.name = 'Havuz Bar'
     on conflict (hotel_id, key) do update set value = excluded.value`,
  );
  await cashier.reload();
  await expect(tableTile(cashier, "M1")).toContainText("₺12,00");
  await expect(tableTile(cashier, "M1")).not.toContainText("€");
});
