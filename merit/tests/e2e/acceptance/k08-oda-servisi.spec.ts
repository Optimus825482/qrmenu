import { expect, resetAndSeed, test } from "../fixtures";
import { setPhoneConfirm } from "../e2eDb";
import { runJob } from "../helpers/runJob";
import { deliverRoom, roomOrder, roomStaff, roomToken, sql } from "./order-support";

test.use({ locale: "tr-TR" });

test.describe("@kabul-8 Oda servisi teyit ve canlı durum zinciri", () => {
  test.beforeAll(() => resetAndSeed({ guestMenu: true }));
  for (const phone of [false, true]) {
    test(`telefon teyidi ${phone ? "açık" : "kapalı"}: her durum misafire en çok 3 saniyede ulaşır`, async ({ page, browser }) => {
      test.setTimeout(120_000);
      await setPhoneConfirm("ROYAL", phone);
      const ops = await roomStaff(browser, "oda.mr");
      const kitchen = await roomStaff(browser, "mutfak.oda");
      try { await deliverRoom(ops, kitchen, page, await roomOrder(page), phone); }
      finally { await Promise.all([ops, kitchen].map(p => p.context().close())); }
    });
  }
  test("SLA saati ilerletilince yönetime bir kez bildirim gider; kapalı otelde kart görünmez", async ({ page }) => {
    await setPhoneConfirm("ROYAL", false);
    const order = await roomOrder(page);
    runJob("rs.sla", new Date(Date.now() + 31 * 60_000));
    const notices = () => sql<{ username: string }>(`SELECT u.username FROM notifications n JOIN users u ON u.id=n.user_id WHERE n.type='order.sla.breach' AND n.ref_id=$1`, [order.id]);
    const first = await notices();
    expect(first.map(n => n.username)).toContain("fbm.mr");
    runJob("rs.sla", new Date(Date.now() + 32 * 60_000));
    expect(await notices()).toEqual(first);
    await sql("UPDATE hotel_modules SET enabled=false WHERE module_key='ROOM_SERVICE' AND hotel_id=(SELECT id FROM hotels WHERE code='DIAMOND')");
    await page.goto(`/q/${await roomToken("301", "DIAMOND")}`);
    await expect(page.getByRole("link", { name: /Oda Servisi/ })).toHaveCount(0);
  });
});
