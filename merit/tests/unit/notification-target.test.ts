import { describe, expect, it } from "vitest";
import { notificationTarget } from "@/shell/notificationTarget";

const n = (type: string, refType: string | null, refId: string | null = "x1", hotelId: string | null = "h1") => ({
  type,
  refType,
  refId,
  hotelId,
});

describe("notificationTarget", () => {
  it("MyBar talebi: MyBar Talepleri ekranı, kayıt seçili, bildirimin oteli", () => {
    expect(notificationTarget(n("mybar.created", "MybarRequest", "req9"))).toEqual({
      appId: "minibar.mybar",
      hotelId: "h1",
      focusId: "req9",
    });
  });

  it("manuel kayıt ve düzeltme talepleri onay ekranını açar", () => {
    expect(notificationTarget(n("minibar.manual.created", "MinibarManualEntryRequest"))?.appId).toBe("minibar.onaylar");
    expect(notificationTarget(n("minibar.correction.resolved", "MinibarTransaction"))?.appId).toBe("minibar.onaylar");
  });

  it("oda servisi siparişi kayıtlar ekranını açar; masa siparişinin masaüstü ekranı yoktur", () => {
    expect(notificationTarget(n("order.created", "Order"))?.appId).toBe("rs.kayitlar");
    expect(notificationTarget(n("order.ready", "Order"))).toBeNull();
  });

  it("kayıt türü yoksa tür önekinden bulur; bilinmeyen tür null döner; otelsiz bildirim otel taşımaz", () => {
    expect(notificationTarget(n("stock.critical", null))?.appId).toBe("minibar.stok");
    expect(notificationTarget(n("bilinmeyen.tur", null))).toBeNull();
    expect(notificationTarget(n("mail.failed", "MailQueue", "m1", null))).toEqual({ appId: "core.rapor" });
  });
});
