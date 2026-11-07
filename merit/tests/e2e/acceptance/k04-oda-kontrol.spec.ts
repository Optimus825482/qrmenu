import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fromZonedTime } from "date-fns-tz";
import { expect, test } from "../fixtures";
import { runJob } from "../helpers/runJob";
import { makeOccupancyFiles } from "../../fixtures/occupancy/make-occupancy";
import { count, product, room, seedMinibar, signIn, sql, today, upload } from "./helpers/minibar";

test.describe("@kabul-4 Oda kontrolü, havuz, rapor ve DND", () => {
  test.beforeEach(() => seedMinibar());

  test("+1 havuzdan düşer, rapora yansır; günlük setup sınırı ve Sarfiyat Yok sunucuda korunur", async ({ browser, baseURL }) => {
    test.setTimeout(120_000);
    const kat = await signIn(browser, baseURL!, "kat.mr");
    const depo = await signIn(browser, baseURL!, "depo.mr");
    const dir = await mkdtemp(path.join(os.tmpdir(), "merit-k04-"));
    try {
      const files = await makeOccupancyFiles(today(), dir);
      for (const [key, kind] of [["inhouse", "IN_HOUSE"], ["arrivals", "ARRIVAL"], ["departures", "DEPARTURE"]] as const) {
        expect((await upload(depo, files[key], kind)).status()).toBe(200);
      }
      const id = (await room("101")).id;
      const cola = await product("Kola"); // MINI setup limit = 2.
      const mini = (await sql<{ id: string }>("SELECT id FROM setups WHERE name='MINI'"))[0].id;
      const balance = () => count("SELECT remaining_qty AS n FROM hotel_stocks WHERE product_id=$1", [cola]);
      const before = await balance();
      const add = (qty: number) => kat.request.post(`/api/minibar/room/${id}/check`, { data: { items: [{ productId: cola, setupId: mini, qty }], clientRequestId: randomUUID() } });
      const checkPage = await kat.newPage();
      await checkPage.goto(`/kat/oda-kontrol/${id}`);
      await checkPage.getByRole("button", { name: "Kola artır" }).click();
      const firstResponse = checkPage.waitForResponse(response => response.request().method() === "POST" && new URL(response.url()).pathname === `/api/minibar/room/${id}/check`);
      await checkPage.getByRole("button", { name: "Kaydet (1 ürün ikame)" }).click();
      const first = await firstResponse;
      expect(first.status(), await first.text()).toBe(200);
      expect(await first.json()).toMatchObject({ added: 1, taskCompleted: true });
      await expect(checkPage.getByTestId("added-today-Kola")).toContainText("1");
      expect(await balance()).toBe(before - 1);
      const report = await depo.request.get(`/api/minibar/reports/consumption?startDate=${today()}&endDate=${today()}&roomId=${id}`);
      expect(report.status(), await report.text()).toBe(200);
      const reportBody = await report.json();
      const staffName = (await sql("SELECT full_name FROM users WHERE username='kat.mr'"))[0].full_name;
      expect(reportBody).toMatchObject({ totalQuantity: 1, transactionsCount: 1, reportItems: [{ roomNumber: "101", staffName, items: [{ productName: "Kola", quantity: 1 }] }] });
      expect(await count("SELECT sum(i.consumed) AS n FROM minibar_transaction_items i JOIN minibar_transactions t ON t.id=i.transaction_id WHERE t.room_id=$1 AND i.product_id=$2", [id, cola])).toBe(1);
      expect((await add(1)).status()).toBe(200);
      const excess = await add(1);
      expect(excess.status(), await excess.text()).toBe(409);
      expect(await excess.json()).toMatchObject({ code: "DAILY_LIMIT" });
      expect(await balance()).toBe(before - 2);
      await checkPage.goto(`/kat/oda-kontrol/${id}`);
      await expect(checkPage.getByRole("button", { name: "Kola artır" })).toBeDisabled();
      await checkPage.goto("/kat/stok");
      await expect(checkPage.getByTestId("kat-stok")).toContainText("Kola");
      await checkPage.close();
      const no = await kat.request.post(`/api/minibar/room/${(await room("104")).id}/no-consumption`, { data: { clientRequestId: randomUUID() } });
      expect(no.status(), await no.text()).toBe(200);
      expect(await no.json()).toMatchObject({ taskCompleted: true });
      expect(await count("SELECT count(*) AS n FROM notifications n JOIN users u ON u.id=n.user_id WHERE u.username='depo.mr' AND n.title='Sarfiyat yok — Oda 104'")).toBe(1);
      const items = await kat.request.get("/api/minibar/tasks");
      expect((await items.json()).items.filter((r: {roomNumber: string}) => r.roomNumber === "104")).toEqual([expect.objectContaining({ status: "TAMAMLANDI" })]);
    } finally { await Promise.all([kat.close(), depo.close(), rm(dir, { recursive: true, force: true })]); }
  });

  test("DND iki kontrolle tamamlanır; 120 dakika ve gün sonu işleri gerçek beklemeden, tek bildirimle işler", async ({ browser, baseURL }) => {
    test.setTimeout(120_000);
    const kat = await signIn(browser, baseURL!, "kat.mr");
    const kat2 = await signIn(browser, baseURL!, "kat2.mr");
    const depo = await signIn(browser, baseURL!, "depo.mr");
    const dir = await mkdtemp(path.join(os.tmpdir(), "merit-k04-dnd-"));
    try {
      const files = await makeOccupancyFiles(today(), dir);
      for (const [key, kind] of [["inhouse", "IN_HOUSE"], ["arrivals", "ARRIVAL"], ["departures", "DEPARTURE"]] as const) {
        expect((await upload(depo, files[key], kind)).status()).toBe(200);
      }
      const mark = (c: typeof kat, id: string) => c.request.post(`/api/minibar/room/${id}/dnd`, { data: {} });
      const id = (await room("103")).id;
      expect(await (await mark(kat, id)).json()).toMatchObject({ count: 1, completed: false });
      expect((await sql("SELECT status FROM daily_task_items WHERE room_id=$1", [id]))[0].status).toBe("DND_BEKLIYOR");
      expect(await (await mark(kat2, id)).json()).toMatchObject({ count: 2, completed: true });
      expect((await sql("SELECT status FROM daily_task_items WHERE room_id=$1", [id]))[0].status).toBe("TAMAMLANDI");
      const active = (await room("104")).id;
      expect((await mark(kat, active)).status()).toBe(200);
      const noon = fromZonedTime(`${today()}T12:00:00`, "Europe/Nicosia");
      await sql("UPDATE room_dnds SET first_at=$1,last_at=$1 WHERE room_id=$2", [noon, active]);
      expect(runJob("dnd.recheck", new Date(noon.getTime() + 119 * 60_000))).toBe(0);
      expect(runJob("dnd.recheck", new Date(noon.getTime() + 121 * 60_000))).toBe(1);
      expect(runJob("dnd.recheck", new Date(noon.getTime() + 122 * 60_000))).toBe(0);
      expect(await count("SELECT count(*) AS n FROM notifications n JOIN users u ON u.id=n.user_id WHERE u.username='kat.mr' AND n.type='dnd.reminder'")).toBe(1);
      const end = fromZonedTime(`${today()}T23:59:00`, "Europe/Nicosia");
      expect(runJob("dnd.endOfDay", end)).toBe(1);
      expect(runJob("dnd.endOfDay", end)).toBe(0);
      expect((await sql("SELECT status FROM room_dnds WHERE room_id=$1", [active]))[0].status).toBe("EKSIK");
      expect((await sql("SELECT status FROM daily_task_items WHERE room_id=$1", [active]))[0].status).toBe("EKSIK");
      expect(await count("SELECT count(*) AS n FROM notifications n JOIN users u ON u.id=n.user_id WHERE u.username='depo.mr' AND n.type='dnd.dayend'")).toBe(1);
      // A subsequent room replacement resolves an active DND automatically.
      const replacement = (await room("201")).id;
      expect((await mark(kat, replacement)).status()).toBe(200);
      const mini = (await sql("SELECT id FROM setups WHERE name='MINI'"))[0].id;
      expect((await kat.request.post(`/api/minibar/room/${replacement}/check`, { data: { items: [{ productId: await product("Su"), setupId: mini, qty: 1 }], clientRequestId: randomUUID() } })).status()).toBe(200);
      expect((await sql("SELECT status FROM room_dnds WHERE room_id=$1", [replacement]))[0].status).toBe("TAMAMLANDI");
      expect(await count("SELECT count(*) AS n FROM notifications n JOIN users u ON u.id=n.user_id WHERE u.username='depo.mr' AND n.type='dnd.marked' AND n.ref_id=(SELECT id FROM room_dnds WHERE room_id=$1)", [replacement])).toBe(1);
    } finally { await Promise.all([kat.close(), kat2.close(), depo.close(), rm(dir, { recursive: true, force: true })]); }
  });
});
