import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import ExcelJS from "exceljs";
import { makeOccupancyFiles } from "../../fixtures/occupancy/make-occupancy";
import { findStartItem } from "../definitionsUi";
import { expect, login, resetAndSeed, test } from "../fixtures";
import { newContextPage } from "../menuUi";
import { approveOrder, assignWaiter, openStaff, prepareOrder, sendGuestOrder, serveOrder } from "../opsUi";
import { deliverRoom, roomOrder, roomStaff, roomToken, sql } from "./order-support";

test.use({ locale: "tr-TR" });

test.describe("@kabul-otel-gunu modüller arası tek iş günü", () => {
  test("doluluk → kontrol → MyBar → oda/masa servisi → rapor ve canlı radar tutarlıdır", async ({ page: guest, browser }) => {
    test.setTimeout(240_000);
    process.env.SEED_MINIBAR = "1";
    try { resetAndSeed({ guestMenu: true }); } finally { delete process.env.SEED_MINIBAR; }
    const day = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Nicosia" });
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "merit-otel-gunu-"));
    const pages = [];
    const admin = await newContextPage(browser); pages.push(admin);
    const kat = await newContextPage(browser); pages.push(kat);
    const depo = await newContextPage(browser); pages.push(depo);
    try {
      // The acceptance seed supplies complete definitions; no training data is involved.
      await login(admin, "admin");
      await expect(admin).toHaveURL(/\/admin$/);
      await admin.getByRole("button", { name: "başlat" }).click();
      await (await findStartItem(admin, "Kurulum Rehberi")).click();
      await admin.getByRole("region", { name: "Kurulum Rehberi", exact: true }).getByRole("button", { name: /^Merit Royal logosu\s+Merit Royal$/ }).click();
      await expect(admin.getByTestId("guide-percent")).toHaveText("%100");
      await admin.getByRole("button", { name: "başlat" }).click();
      await (await findStartItem(admin, "Komuta Merkezi")).click();
      const command = admin.getByRole("region", { name: "Komuta Merkezi", exact: true });
      await expect(command.getByTestId("kpi-chips")).toBeVisible();

      await login(depo, "depo.mr");
      await expect(depo).toHaveURL(/\/depo\/stok$/);
      await login(kat, "kat.mr");
      await expect(kat).toHaveURL(/\/kat$/);
      const files = await makeOccupancyFiles(day, tmp);
      for (const [kind, file] of [["IN_HOUSE", files.inhouse], ["ARRIVAL", files.arrivals], ["DEPARTURE", files.departures]]) {
        const res = await depo.request.post("/api/minibar/occupancy/upload", { multipart: { kind, file: { name: path.basename(file), mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: fs.readFileSync(file) } } });
        expect(res.status(), await res.text()).toBe(200);
      }
      const [room] = await sql<{ id: string }>("SELECT r.id FROM rooms r JOIN hotels h ON h.id=r.hotel_id WHERE h.code='ROYAL' AND r.number='104'");
      const [water] = await sql<{ id: string }>("SELECT id FROM products WHERE name='Su'");
      const [setup] = await sql<{ id: string }>("SELECT id FROM setups WHERE name='MINI'");
      const balance = async () => (await sql<{ remaining_qty: number }>("SELECT s.remaining_qty FROM hotel_stocks s JOIN products p ON p.id=s.product_id WHERE p.name='Su'"))[0].remaining_qty;
      const opening = await balance();
      const check = await kat.request.post(`/api/minibar/room/${room.id}/check`, { data: { items: [{ productId: water.id, setupId: setup.id, qty: 1 }], clientRequestId: randomUUID() } });
      expect(check.status(), await check.text()).toBe(200);

      await kat.goto("/kat/mybar");
      const token = await roomToken("104");
      await guest.goto(`/q/${token}`);
      await expect(command).toContainText("scan.room");
      const request = await guest.request.post(`/api/q/${token}/mybar`, { data: { idempotencyKey: randomUUID(), locale: "tr", items: [{ productId: water.id, qty: 1 }] } });
      expect(request.status(), await request.text()).toBe(200);
      await expect(command).toContainText("mybar.created");
      await kat.getByRole("alertdialog").getByRole("button", { name: "Gördüm" }).click();
      const row = kat.getByTestId("mybar-row").filter({ hasText: "104" });
      await row.getByRole("button", { expanded: false }).click();
      await kat.getByRole("button", { name: "Tümünü Karşıla" }).click();
      await kat.getByRole("button", { name: "Talebi Kapat" }).click();
      await kat.getByRole("dialog").getByRole("button", { name: "Kapat", exact: true }).click();
      await expect(row).toHaveAttribute("data-status", "TAMAMLANDI");
      expect(await balance()).toBe(opening - 2);

      const ops = await roomStaff(browser, "oda.mr"); pages.push(ops);
      const rsKitchen = await roomStaff(browser, "mutfak.oda"); pages.push(rsKitchen);
      await deliverRoom(ops, rsKitchen, guest, await roomOrder(guest, "104"), false);
      const cashier = await openStaff(browser, "kasa.havuz"); pages.push(cashier);
      const kitchen = await openStaff(browser, "kds.havuz"); pages.push(kitchen);
      const waiter = await openStaff(browser, "garson.havuz"); pages.push(waiter);
      const table = await sendGuestOrder(guest);
      await expect(command).toContainText("order.created");
      await assignWaiter(cashier, "M1", "Test garson.havuz");
      await approveOrder(cashier, table.orderNo);
      await prepareOrder(kitchen, table.orderNo);
      await serveOrder(waiter, table.orderNo);
      expect(await sql("SELECT id FROM orders WHERE kind='MASA' AND status='SERVIS_EDILDI' ")).toHaveLength(1);
      expect(await sql("SELECT id FROM orders WHERE kind='ODA_SERVISI' AND status='TESLIM_EDILDI' ")).toHaveLength(1);

      const [hotel] = await sql<{ id: string }>("SELECT id FROM hotels WHERE code='ROYAL'");
      const report = await admin.request.get(`/api/reports/tuketim/export?format=xlsx&hotelIds=${hotel.id}&from=${day}&to=${day}&p.groupBy=oda`);
      expect(report.status(), await report.text()).toBe(200);
      const book = new ExcelJS.Workbook();
      await book.xlsx.load(new Uint8Array(await report.body()).buffer);
      const rows: unknown[][] = [];
      book.worksheets[0].eachRow(r => rows.push((r.values as unknown[]).slice(1)));
      const header = rows.findIndex(r => r.includes("Tüketim") && r.includes("MyBar"));
      expect(header).toBeGreaterThan(-1);
      const cols = rows[header];
      const data = rows.slice(header + 1).find(r => r[cols.indexOf("Oda")] === "104");
      expect(data).toBeDefined();
      expect(data![cols.indexOf("Tüketim")]).toBe(1);
      expect(data![cols.indexOf("MyBar")]).toBe(1);
      // Current reporting contract separates MASA (siparis-ozet) and ODA_SERVISI (rs-sla).
      for (const key of ["siparis-ozet", "rs-sla"]) {
        const res = await admin.request.get(`/api/reports/${key}/export?format=xlsx&hotelIds=${hotel.id}&from=${day}&to=${day}`);
        expect(res.status(), key).toBe(200);
        const summaryBook = new ExcelJS.Workbook();
        await summaryBook.xlsx.load(new Uint8Array(await res.body()).buffer);
        let total: unknown;
        summaryBook.worksheets[0].eachRow(r => { if (r.getCell(1).value === "Toplam sipariş") total = r.getCell(2).value; });
        expect(total, key).toBe(1);
      }
      const audit = Object.fromEntries((await sql<{ action: string; n: number }>("SELECT action,count(*)::int AS n FROM audit_logs GROUP BY action")).map(a => [a.action, a.n]));
      expect(audit).toMatchObject({ OCCUPANCY_UPLOAD: 3, MINIBAR_REPLACE: 1, MYBAR_CREATE: 1, MYBAR_SEEN: 1,
        MYBAR_FULFILL: 1, MYBAR_COMPLETE: 1, TABLE_ASSIGN: 1, ORDER_ONAYLANDI: 2, ORDER_HAZIR: 2,
        ORDER_PREP: 1, ORDER_YOLDA: 1, ORDER_TESLIM_EDILDI: 1, ORDER_SERVIS_EDILDI: 1 });
      // Guest order creation is recorded in order_events; authenticated staff writes additionally audit.
      expect(await sql(`SELECT id FROM order_events WHERE "from" IS NULL AND "to"='GONDERILDI'`)).toHaveLength(2);
    } finally {
      await Promise.all(pages.map(p => p.context().close()));
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});
