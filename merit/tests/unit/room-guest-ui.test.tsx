// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { createTranslator, NextIntlClientProvider } from "next-intl";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ar from "@/lib/i18n/messages/ar.json";
import de from "@/lib/i18n/messages/de.json";
import el from "@/lib/i18n/messages/el.json";
import en from "@/lib/i18n/messages/en.json";
import fr from "@/lib/i18n/messages/fr.json";
import itMessages from "@/lib/i18n/messages/it.json";
import ru from "@/lib/i18n/messages/ru.json";
import tr from "@/lib/i18n/messages/tr.json";
import { DomainError } from "@/lib/result";
import type { GuestOrderView } from "@/modules/order/server/guestOrder";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh, push: vi.fn() }),
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  redirect: (to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`);
  },
}));
vi.mock("@/modules/menu/ui/guest/useGuestEvents", () => ({ useGuestEvents: () => ({ connected: true }) }));
vi.mock("@/shell/components/PwaInstallButton", () => ({ PwaInstallButton: () => null }));
vi.mock("next-intl/server", () => ({
  getLocale: async () => "tr",
  getTranslations: async (ns: string) => createTranslator({ locale: "tr", messages: tr, namespace: ns as "guest" }),
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));

const roomServiceState = vi.fn();
vi.mock("@/modules/order/server/roomService/roomState", () => ({
  roomServiceState: (...args: unknown[]) => roomServiceState(...args),
}));
const getGuestTarget = vi.fn();
const getRoomPageState = vi.fn();
vi.mock("@/app/(guest)/q/[token]/guestTarget", () => ({
  getGuestTarget: (...args: unknown[]) => getGuestTarget(...args),
  getRoomPageState: (...args: unknown[]) => getRoomPageState(...args),
}));
const roomOrderGet = vi.fn();
vi.mock("@/modules/order/server/roomService/roomOrder", () => ({
  roomOrder: { get: (...args: unknown[]) => roomOrderGet(...args) },
}));
const tableOrderGet = vi.fn();
vi.mock("@/modules/order/server/guestOrder", () => ({
  guestOrder: { get: (...args: unknown[]) => tableOrderGet(...args) },
}));
vi.mock("@/modules/menu/server/guestToken", () => ({ guestMeta: () => ({ ip: "1.1.1.1", userAgent: "" }) }));
const getMenu = vi.fn();
vi.mock("@/modules/menu/server/guestMenu", () => ({ getMenu: (...args: unknown[]) => getMenu(...args) }));

import { OrderStatus } from "@/modules/menu/ui/guest/OrderStatus";
import RoomServiceSlot from "@/modules/mybar/ui/guest/RoomServiceSlot";
import { RoomServiceCard } from "@/modules/order/ui/guest/RoomServiceCard";
import RoomServicePage from "@/app/(guest)/q/[token]/oda-servisi/page";
import OrderStatusPage from "@/app/(guest)/q/[token]/siparis/[orderId]/page";

const roomState = {
  roomId: "room-1",
  hotelId: "hotel-1",
  roomNumber: "101",
  floorName: "1",
  hotel: { name: "Merit", logoUrl: null },
  guestMessage: null,
  mybarOpen: true,
  roomServiceOpen: true,
};
const rsState = {
  roomId: "room-1",
  hotelId: "hotel-1",
  roomNumber: "101",
  hotelName: "Merit",
  roomServiceOpen: true,
  orderingOpen: true,
  rsOutletId: "outlet-1",
  confirmRequired: false,
  slaMinutes: 30,
  pricesShown: true,
  currency: "EUR",
  theme: { bg: "#fff", accent: "#000", soft: "#eee", textOnAccent: "#fff" },
};

function order(over: Partial<GuestOrderView> = {}): GuestOrderView {
  return {
    orderId: "o1",
    orderNo: 7,
    status: "GONDERILDI",
    createdAt: new Date(),
    items: [{ name: "Çay", qty: 2, unitPrice: "3.00", lineTotal: "6.00" }],
    subtotal: "6.00",
    currency: "EUR",
    pricesShown: true,
    kind: "ODA_SERVISI",
    roomNumber: "101",
    roomService: { slaMinutes: 30, confirmRequired: false },
    ...over,
  };
}

function wrap(node: ReactElement, messages: object = tr, locale = "tr") {
  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      {node}
    </NextIntlClientProvider>
  );
}
const status = (o: GuestOrderView) => render(wrap(<OrderStatus token="tok" locale="tr" order={o} />));
const steps = () => Array.from(document.querySelectorAll("ol.g-steps li"));

beforeEach(() => {
  refresh.mockReset();
  roomServiceState.mockReset().mockResolvedValue(rsState);
  getGuestTarget.mockReset();
  getRoomPageState.mockReset();
  roomOrderGet.mockReset();
  tableOrderGet.mockReset();
  getMenu.mockReset();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("OrderStatus - oda servisi adımları", () => {
  it("teyit gerekmiyorsa 4 adım", () => {
    status(order());
    expect(steps().map((s) => s.textContent)).toEqual([
      expect.stringContaining("Gönderildi"),
      expect.stringContaining("Hazırlanıyor"),
      expect.stringContaining("Yolda"),
      expect.stringContaining("Teslim edildi"),
    ]);
  });

  it("teyit gerekiyorsa 5 adım ve TEYIT_BEKLIYOR iken ipucu", () => {
    status(order({ status: "TEYIT_BEKLIYOR", roomService: { slaMinutes: 30, confirmRequired: true } }));
    expect(steps()).toHaveLength(5);
    expect(steps()[1].textContent).toContain("Teyit bekleniyor");
    expect(steps()[1].getAttribute("aria-current")).toBe("step");
    expect(screen.getByText(tr.guest.rs.order.confirmHint)).toBeTruthy();
  });

  it("HAZIR, Hazırlanıyor adımında kalır", () => {
    status(order({ status: "HAZIR" }));
    expect(steps()[1].getAttribute("aria-current")).toBe("step");
  });

  it("ETA yalnız ONAYLANDI..YOLDA arasında görünür", () => {
    const eta = "Tahmini süre: 30 dk";
    for (const s of ["ONAYLANDI", "HAZIR", "YOLDA"]) {
      status(order({ status: s }));
      expect(screen.getByText(eta), s).toBeTruthy();
      cleanup();
    }
    for (const s of ["GONDERILDI", "TEYIT_BEKLIYOR", "TESLIM_EDILDI"]) {
      status(order({ status: s }));
      expect(screen.queryByText(eta), s).toBeNull();
      cleanup();
    }
  });

  it("TESLIM_EDILDI iken teşekkür metni", () => {
    status(order({ status: "TESLIM_EDILDI" }));
    expect(screen.getByText(tr.guest.order.thanks)).toBeTruthy();
  });

  it("IPTAL iken banner ve çevrilmiş yönlendirme var; adım listesi ve personelin yazdığı sebep yok", () => {
    status(order({ status: "IPTAL", rejectReason: "Ürün tükendi" }));
    expect(screen.getByText(tr.guest.rs.order.cancelled)).toBeTruthy();
    expect(screen.getByText(tr.guest.rs.order.cancelledHint)).toBeTruthy();
    expect(document.body.textContent).not.toContain("Ürün tükendi");
    expect(steps()).toHaveLength(0);
    expect(screen.queryByTestId("rs-cancel-by-phone")).toBeNull();
  });

  it("misafir iptal edemez: açık siparişte telefonla arama notu var, iptal düğmesi yok", () => {
    for (const s of ["GONDERILDI", "TEYIT_BEKLIYOR", "ONAYLANDI", "HAZIR", "YOLDA"]) {
      status(order({ status: s }));
      expect(screen.getByTestId("rs-cancel-by-phone").textContent, s).toBe(tr.guest.rs.order.cancelByPhone);
      expect(screen.queryByRole("button"), s).toBeNull();
      cleanup();
    }
    for (const s of ["TESLIM_EDILDI", "IPTAL"]) {
      status(order({ status: s }));
      expect(screen.queryByTestId("rs-cancel-by-phone"), s).toBeNull();
      cleanup();
    }
  });

  it("fiyat yalnız pricesShown iken görünür", () => {
    status(order({ pricesShown: false, subtotal: undefined, items: [{ name: "Çay", qty: 2 }] }));
    expect(document.body.textContent).not.toMatch(/€|EUR/);
    cleanup();
    status(order());
    expect(document.body.textContent).toMatch(/€|EUR/);
  });

  it("masa siparişi eski dört adımı korur ve oda servisi notunu göstermez", () => {
    status(order({ kind: "MASA", roomService: undefined, roomNumber: undefined }));
    expect(steps()).toHaveLength(4);
    expect(steps()[1].textContent).toContain("Onaylandı");
    expect(screen.queryByTestId("rs-cancel-by-phone")).toBeNull();
  });
});

describe("siparis/[orderId] sayfası", () => {
  const params = Promise.resolve({ token: "tok", orderId: "o1" });
  it("oda tokenında yalnız kendi odasının siparişini okur", async () => {
    getGuestTarget.mockResolvedValue({ kind: "ROOM", roomId: "room-1", hotelId: "hotel-1" });
    roomOrderGet.mockResolvedValue(order());
    render(wrap((await OrderStatusPage({ params }))!));
    expect(roomOrderGet).toHaveBeenCalledWith("tok", "o1", expect.anything());
    expect(tableOrderGet).not.toHaveBeenCalled();
    expect(screen.getByText("Sipariş no: #7")).toBeTruthy();
  });

  it("başka odanın siparişi bulunamadı gösterir", async () => {
    getGuestTarget.mockResolvedValue({ kind: "ROOM", roomId: "room-1", hotelId: "hotel-1" });
    roomOrderGet.mockRejectedValue(new DomainError("NOT_FOUND", "Sipariş bulunamadı"));
    render(wrap((await OrderStatusPage({ params }))!));
    expect(screen.getByText(tr.guest.selections.notFound)).toBeTruthy();
    expect(screen.queryByText("Sipariş no: #7")).toBeNull();
  });

  it("masa tokenı eski yolu kullanır", async () => {
    getGuestTarget.mockResolvedValue({ kind: "TABLE", table: { id: "t", label: "1", areaId: "a" }, state: {} });
    tableOrderGet.mockResolvedValue(order({ kind: "MASA", roomService: undefined }));
    render(wrap((await OrderStatusPage({ params }))!));
    expect(tableOrderGet).toHaveBeenCalled();
    expect(roomOrderGet).not.toHaveBeenCalled();
  });

  it("geçersiz token hiçbir şey çizmez", async () => {
    getGuestTarget.mockResolvedValue({ kind: "NONE", reason: "BILINMEYEN" });
    expect(await OrderStatusPage({ params })).toBeNull();
  });
});

describe("RoomServiceCard", () => {
  const card = async (state = roomState) =>
    render(wrap(await RoomServiceCard({ token: "tok", locale: "tr", state })));

  it("açıkken /oda-servisi bağlantısı ve açıklama", async () => {
    await card();
    const link = screen.getByRole("link");
    expect(link.getAttribute("href")).toBe("/q/tok/oda-servisi");
    expect(link.textContent).toContain(tr.guest.room.card.roomService);
    expect(link.textContent).toContain(tr.guest.room.card.roomServiceHint);
    expect(screen.queryByText(tr.guest.rs.unavailable)).toBeNull();
    expect(roomServiceState).toHaveBeenCalledWith("room-1");
  });

  it("sipariş alımı kapalıyken kart açık, alt satırda orderingClosed", async () => {
    roomServiceState.mockResolvedValue({ ...rsState, orderingOpen: false, reason: "SIPARIS_KAPALI" });
    await card();
    expect(screen.getByRole("link")).toBeTruthy();
    expect(screen.getByText(tr.guest.menu.orderingClosed)).toBeTruthy();
  });

  it("menü kapalı/boşken bağlantı yok, 'şu an kullanılamıyor' satırı", async () => {
    roomServiceState.mockResolvedValue({
      ...rsState,
      roomServiceOpen: false,
      orderingOpen: false,
      reason: "MENU_KAPALI",
    });
    await card();
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByText(tr.guest.rs.unavailable)).toBeTruthy();
  });

  it("RoomServiceSlot kartı render eder", async () => {
    render(wrap(await RoomServiceSlot({ token: "tok", locale: "tr", state: roomState })));
    expect(screen.getByRole("link").getAttribute("href")).toBe("/q/tok/oda-servisi");
  });
});

describe("oda-servisi sayfası", () => {
  const props = { params: Promise.resolve({ token: "tok" }) };
  it("ROOM değilse 404", async () => {
    getGuestTarget.mockResolvedValue({ kind: "NONE", reason: "BILINMEYEN" });
    await expect(RoomServicePage(props)).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("oda servisi kapalıysa oda ana sayfasına yönlendirir", async () => {
    getGuestTarget.mockResolvedValue({ kind: "ROOM", roomId: "room-1", hotelId: "hotel-1" });
    getRoomPageState.mockResolvedValue({ ...roomState, roomServiceOpen: false });
    await expect(RoomServicePage(props)).rejects.toThrow("NEXT_REDIRECT:/q/tok");
  });

  it("outlet yoksa yönlendirir", async () => {
    getGuestTarget.mockResolvedValue({ kind: "ROOM", roomId: "room-1", hotelId: "hotel-1" });
    getRoomPageState.mockResolvedValue(roomState);
    roomServiceState.mockResolvedValue({ ...rsState, rsOutletId: undefined, roomServiceOpen: false });
    await expect(RoomServicePage(props)).rejects.toThrow("NEXT_REDIRECT:/q/tok");
  });

  it("kendi odasının durumunu ve outlet menüsünü yükler", async () => {
    getGuestTarget.mockResolvedValue({ kind: "ROOM", roomId: "room-1", hotelId: "hotel-1" });
    getRoomPageState.mockResolvedValue(roomState);
    getMenu.mockResolvedValue({
      state: {
        ...rsState,
        outletId: "outlet-1",
        outletName: "Oda Servisi",
        menuOpen: true,
        design: { layout: [], options: {} },
        callOptions: [],
      },
      categories: [],
    });
    const element = await RoomServicePage(props);
    expect(roomServiceState).toHaveBeenCalledWith("room-1");
    expect(getMenu).toHaveBeenCalledWith("outlet-1", "tr");
    expect(element).toBeTruthy();
  });
});

describe("yeni metinler", () => {
  const all = { tr, en, de, ru, ar, fr, el, it: itMessages } as const;
  it("guest.rs.unavailable ve telefonla iptal metinleri sekiz dilde dolu", () => {
    for (const [locale, messages] of Object.entries(all)) {
      const rs = (messages as typeof tr).guest.rs;
      expect(rs.unavailable, locale).toBeTruthy();
      expect(rs.order.cancelByPhone, locale).toBeTruthy();
      expect(rs.order.cancelledHint, locale).toBeTruthy();
    }
  });
});
