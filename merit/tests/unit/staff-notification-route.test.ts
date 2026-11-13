import { describe, expect, it } from "vitest";
import { buildNav } from "@/components/staff/navModel";
import { staffNotificationHref } from "@/components/staff/notificationRoute";

const hrefs = (codes: string[], pathname?: string) => {
  const nav = buildNav(new Set(codes), { pathname });
  return [...nav.primary, ...nav.more].map((item) => item.href);
};

const KAT = hrefs(["MB-KAT", "MB-KF", "MB-TUK", "MB-TAL", "MB-ZIM", "MB-PERS"]);
const GARSON = hrefs(["QS-KUY", "QM-CAG", "RO-TAL"]);
const ODS = hrefs(["RO-TAL", "RO-TES"]);

describe("staffNotificationHref", () => {
  it("MyBar talebi kat sorumlusunu MyBar taleplerine götürür", () => {
    expect(staffNotificationHref({ type: "mybar.created", refType: "MybarRequest" }, KAT)).toBe("/kat/mybar");
  });

  it("masa çağrısı garsonu çağrılara, yeni masa siparişi kuyruğa götürür", () => {
    expect(staffNotificationHref({ type: "call.created", refType: "WaiterCall" }, GARSON)).toBe("/garson/cagrilar");
    expect(staffNotificationHref({ type: "order.created", refType: "Order", title: "Yeni sipariş" }, GARSON)).toBe("/garson");
  });

  it("oda servisi siparişi ve SLA uyarısı oda servisi taleplerine götürür", () => {
    expect(
      staffNotificationHref({ type: "order.created", refType: "Order", title: "Yeni oda servisi siparişi" }, ODS),
    ).toBe("/oda-servisi");
    expect(staffNotificationHref({ type: "order.sla.breach", refType: "Order", title: "Oda servisi SLA aşıldı" }, GARSON)).toBe(
      "/oda-servisi",
    );
  });

  it("minibar bildirimleri kendi sayfalarına götürür", () => {
    expect(staffNotificationHref({ type: "dnd.marked", refType: "RoomDnd" }, KAT)).toBe("/kat");
    expect(staffNotificationHref({ type: "minibar.manual.resolved", refType: "MinibarManualEntryRequest" }, KAT)).toBe(
      "/kat/manuel-kayit",
    );
    expect(staffNotificationHref({ type: "stock.critical", refType: "HotelStock" }, KAT)).toBe("/kat/stok");
  });

  it("kayıt türü yoksa tür önekinden bulur", () => {
    expect(staffNotificationHref({ type: "mybar.stale", refType: null }, KAT)).toBe("/kat/mybar");
  });

  it("menüde olmayan sayfaya götürmez; bilinmeyen tür null döner", () => {
    expect(staffNotificationHref({ type: "mybar.created", refType: "MybarRequest" }, ODS)).toBeNull();
    expect(staffNotificationHref({ type: "audit.created", refType: "AppScreen" }, KAT)).toBeNull();
  });
});
