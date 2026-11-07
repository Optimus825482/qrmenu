import nodemailer from "nodemailer";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { MAIL_KINDS } from "@/modules/reporting/constants";
import { testDb, truncate } from "../helpers/db";
import { dropReferenceData, hotelId, makeUser, resetReferenceData, resetTestData } from "../helpers/fixtures";
import { addConsumption, addDnd, addMovement, addMybar, addOrder, addTaskItems } from "../helpers/reportFixtures";
import { startSmtpStub } from "../helpers/smtpStub";

const CLEAN = [
  "email_logs",
  "minibar_transactions",
  "hotel_stock_movements",
  "room_dnds",
  "daily_tasks",
  "orders",
  "products",
  "product_groups",
  "rooms",
  "floors",
  "outlets",
];

beforeAll(resetReferenceData);
beforeEach(async () => {
  await resetTestData();
  await truncate(...CLEAN);
});
afterAll(async () => {
  await truncate(...CLEAN);
  await dropReferenceData();
  await testDb.$disconnect();
});

const transport = (port: number) =>
  nodemailer.createTransport({ host: "127.0.0.1", port, secure: false, ignoreTLS: true });
const mail = { from: "a@example.test", to: "b@example.test", subject: "x", text: "x" };

describe("P7 şeması", () => {
  it("User.emailOptIn varsayılan false", async () => {
    const u = await makeUser({ username: "optin-1", roleCode: "R-OTM", hotelCode: "ROYAL" });
    expect(u.emailOptIn).toBe(false);
  });

  it("aynı dedupeKey ikinci EmailLog P2002; boş dedupeKey çoğul olabilir", async () => {
    const base = { to: "a@example.test", subject: "s", kind: "TEST" };
    await testDb.emailLog.create({ data: { ...base, trackingId: "t1", dedupeKey: "k1" } });
    await expect(
      testDb.emailLog.create({ data: { ...base, trackingId: "t2", dedupeKey: "k1" } }),
    ).rejects.toMatchObject({ code: "P2002" });
    await testDb.emailLog.create({ data: { ...base, trackingId: "t3" } });
    await testDb.emailLog.create({ data: { ...base, trackingId: "t4" } });
  });

  it("EmailStatus.IPTAL ve yeni alanlar yazılır", async () => {
    const hid = await hotelId("ROYAL");
    const row = await testDb.emailLog.create({
      data: {
        to: "a@example.test",
        subject: "s",
        kind: MAIL_KINDS[0],
        trackingId: "t9",
        status: "IPTAL",
        hotelId: hid,
        template: "gunluk-gorev",
        params: { date: "2026-11-06" },
        attempts: 2,
        sentAt: new Date(),
        messageId: "<m@x>",
      },
    });
    expect(row).toMatchObject({ status: "IPTAL", hotelId: hid, template: "gunluk-gorev", attempts: 2 });
  });

  it("smtpStub kabul eder, reddeder, kapalıyken bağlanılamaz", async () => {
    const stub = await startSmtpStub("accept");
    await transport(stub.port).sendMail({ ...mail, subject: "Merhaba", html: "<p>ğ</p>" });
    expect(stub.received).toHaveLength(1);
    expect(stub.received[0]!.subject).toBe("Merhaba");
    await stub.close();

    const refused = await startSmtpStub({ reply: 550, text: "no" });
    await expect(transport(refused.port).sendMail(mail)).rejects.toMatchObject({ responseCode: 550 });
    await refused.close();

    const down = await startSmtpStub("down");
    await expect(transport(down.port).sendMail(mail)).rejects.toBeTruthy();
  });

  it("rapor fixture'ları yazar", async () => {
    const common = { hotelCode: "ROYAL", username: "kat-1" };
    await addConsumption({ ...common, roomNo: "101", productName: "Kola", consumed: 2, added: 2 });
    await addMybar({ ...common, roomNo: "101", productName: "Su", added: 3, salePrice: null });
    await addMovement({ ...common, productName: "Kola", type: "KULLANIM", qty: -2 });
    await addDnd({ hotelCode: "ROYAL", roomNo: "102" });
    await addTaskItems({ hotelCode: "ROYAL", rooms: [{ roomNo: "101", status: "TAMAMLANDI", completedBy: "kat-1" }] });
    await addOrder({
      hotelCode: "ROYAL",
      outletName: "Havuz Bar",
      items: [{ name: "Mojito", qty: 1, unitPrice: 9.5 }],
      pricesShown: true,
    });
    expect(await testDb.minibarTransaction.count()).toBe(2);
    expect(await testDb.taskStatusLog.count({ where: { to: "TAMAMLANDI" } })).toBe(1);
    expect(await testDb.order.count()).toBe(1);
    expect(await testDb.roomDnd.count()).toBe(1);
  });
});
