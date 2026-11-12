// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ar from "@/lib/i18n/messages/ar.json";
import en from "@/lib/i18n/messages/en.json";
import type { Locale } from "@/lib/i18n/locales";
import type { RoomCatalog } from "@/modules/mybar/server/catalog";
import { MybarForm } from "@/modules/mybar/ui/guest/MybarForm";
import { RoomFrame } from "@/modules/mybar/ui/guest/RoomFrame";

const layoutSegment = vi.hoisted(() => ({ current: null as string | null }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => {} }),
  useSelectedLayoutSegment: () => layoutSegment.current,
}));

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  onerror: (() => void) | null = null;
  listeners = new Map<string, () => void>();
  constructor(public url: string) {
    FakeEventSource.instances.push(this);
  }
  addEventListener(type: string, fn: () => void) {
    this.listeners.set(type, fn);
  }
  close() {}
}

const catalog = (mode: "QTY" | "TICK" = "QTY"): RoomCatalog => ({
  quantityMode: mode,
  groups: [
    {
      id: "g1",
      name: "İçecek",
      nameLocal: "Drinks",
      products: [
        { id: "p1", name: "Su 0.5L", nameLocal: "Water 0.5L", setupQty: 2, maxQty: 2 },
        { id: "p2", name: "Kola", nameLocal: "Cola", setupQty: 2, maxQty: mode === "TICK" ? 1 : 2 },
      ],
    },
    { id: "g2", name: "Atıştırmalık", nameLocal: "Snacks", products: [{ id: "p3", name: "Cips", nameLocal: "Chips", setupQty: 1, maxQty: 1 }] },
  ],
});

function wrap(children: ReactNode, locale: Locale = "en") {
  const messages = locale === "ar" ? ar : en;
  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      {children}
    </NextIntlClientProvider>
  );
}

type Fetch = ReturnType<typeof vi.fn>;
let fetchMock: Fetch;
const json = (status: number, body: unknown) => ({ ok: status < 400, status, json: async () => body }) as Response;
const statusBody = (status: string | null) =>
  json(200, {
    ok: true,
    data: { request: status ? { requestId: "r1", status, createdAt: "2026-11-03T08:00:00Z", items: [{ name: "Cola", qty: 1 }], removals: [{ name: "Water 0.5L", qty: 2 }] } : null },
  });

beforeEach(() => {
  FakeEventSource.instances = [];
  vi.stubGlobal("EventSource", FakeEventSource);
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  sessionStorage.setItem("mybar-intro:tok", "1"); // the intro dialog is covered by its own tests
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const renderForm = (opts: { mode?: "QTY" | "TICK"; initial?: null | { status: string } } = {}) =>
  render(
    wrap(
      <MybarForm
        token="tok"
        locale="en"
        catalog={catalog(opts.mode)}
        dailyLimit
        initialRequest={
          opts.initial
            ? ({ requestId: "r1", status: opts.initial.status, createdAt: "2026-11-03T08:00:00Z", items: [{ name: "Cola", qty: 1 }], removals: [{ name: "Water 0.5L", qty: 2 }] } as never)
            : null
        }
      />,
    ),
  );

const SEND = /SEND MYBAR REQUEST/;
const plusOf = (name: string) => screen.getByRole("button", { name: `Add one ${name}` }) as HTMLButtonElement;
const minusOf = (name: string) => screen.getByRole("button", { name: `Remove one ${name}` }) as HTMLButtonElement;
const clickTimes = (el: HTMLElement, n: number) => {
  for (let i = 0; i < n; i++) fireEvent.click(el);
};
const next = () => fireEvent.click(screen.getByRole("button", { name: /Continue/ }));
const back = () => fireEvent.click(screen.getByRole("button", { name: /Back/ }));
const noteField = () => screen.getByLabelText("Additional notes or special requests");

describe("MybarForm", () => {
  it("adım 1: ilk grup paneli açık; hap tıklanınca panel değişir; kartta minibar adedi yazar", () => {
    renderForm();
    expect(screen.getByText("Step 1 / 2")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "What would you rather not have?" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Drinks" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByText("Water 0.5L")).toBeTruthy();
    expect(screen.getAllByText("In your minibar: 2").length).toBe(2);
    expect(screen.queryByText("Chips")).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: "Snacks" }));
    expect(screen.getByText("Chips")).toBeTruthy();
    expect(screen.getByText("In your minibar: 1")).toBeTruthy();
    expect(screen.queryByText("Water 0.5L")).toBeNull();
  });

  it("adım 1: 0..setupQty arası stepper; sınırda + pasif, 0'da − pasif; özet satırı ve çip × kaldırır; seçim yokken Continue pasif", () => {
    renderForm();
    const cont = screen.getByRole("button", { name: /Continue/ }) as HTMLButtonElement;
    expect(cont.disabled).toBe(true);
    expect(minusOf("Water 0.5L").disabled).toBe(true);
    clickTimes(plusOf("Water 0.5L"), 3);
    expect(plusOf("Water 0.5L").disabled).toBe(true);
    expect(cont.disabled).toBe(false);
    const chips = screen.getByRole("region", { name: "To be taken out: 2" });
    expect(chips.textContent).toContain("Water 0.5L");
    expect(chips.textContent).toContain("×2");
    fireEvent.click(within(chips).getByRole("button", { name: "Remove Water 0.5L" }));
    expect(screen.getByText("No product selected yet")).toBeTruthy();
    expect(cont.disabled).toBe(true);
  });

  it("adım 2: çıkarılan ürün sunulmaz; toplam çıkarılana eşitlenince tüm + düğmeleri pasif, uyarı metni yok", () => {
    renderForm();
    clickTimes(plusOf("Water 0.5L"), 2); // 2 çıkacak
    fireEvent.click(screen.getByRole("tab", { name: "Snacks" }));
    clickTimes(plusOf("Chips"), 1); // 3 çıkacak
    next();
    expect(screen.getByText("Step 2 / 2")).toBeTruthy();
    expect(document.activeElement?.textContent).toBe("What would you like more of?");
    // Water ve Chips tamamen çıkarıldı: yalnız Cola sunulur, Snacks grubu hiç yok
    expect(screen.queryByText("Water 0.5L")).toBeNull();
    expect(screen.queryByRole("tab", { name: "Snacks" })).toBeNull();
    expect(screen.getByText("Cola")).toBeTruthy();
    expect(screen.getByText("0 / 3")).toBeTruthy();
    clickTimes(plusOf("Cola"), 2);
    expect(screen.getByText("2 / 3")).toBeTruthy();
    expect(plusOf("Cola").disabled).toBe(false);
    clickTimes(plusOf("Cola"), 1);
    expect(screen.getByText("3 / 3")).toBeTruthy();
    expect(plusOf("Cola").disabled).toBe(true);
    expect(minusOf("Cola").disabled).toBe(false);
    expect(screen.queryByRole("alert")).toBeNull();
    // bir tane azaltınca + yeniden açılır
    fireEvent.click(minusOf("Cola"));
    expect(plusOf("Cola").disabled).toBe(false);
  });

  it("kısmen çıkarılan ürün de adım 2'de sunulmaz", () => {
    renderForm();
    fireEvent.click(plusOf("Water 0.5L")); // 2'den yalnız 1
    next();
    expect(screen.queryByText("Water 0.5L")).toBeNull();
    expect(screen.getByText("Cola")).toBeTruthy();
  });

  it("Back seçimleri korur; çıkarılanlar azalınca fazla eklemeler kırpılır, çıkarılan ürünün eklemesi silinir", () => {
    renderForm();
    clickTimes(plusOf("Water 0.5L"), 2);
    next();
    clickTimes(plusOf("Cola"), 2);
    back();
    expect(screen.getByText("Step 1 / 2")).toBeTruthy();
    expect(screen.getByRole("region", { name: "To be taken out: 2" }).textContent).toContain("×2");
    fireEvent.click(minusOf("Water 0.5L")); // 1 çıkacak
    next();
    expect(screen.getByText("1 / 1")).toBeTruthy(); // 2 ekleme 1'e kırpıldı
    expect(plusOf("Cola").disabled).toBe(true);
    // Cola'yı da çıkarılacaklara katınca eklemesi silinir ve ürün artık sunulmaz
    back();
    fireEvent.click(plusOf("Cola"));
    next();
    expect(screen.queryByText("Cola")).toBeNull();
    expect(screen.getByText("0 / 2")).toBeTruthy();
  });

  it("TICK: adımlar yine stepper; ekleme ürün başına en çok 1", () => {
    renderForm({ mode: "TICK" });
    clickTimes(plusOf("Water 0.5L"), 2);
    next();
    clickTimes(plusOf("Cola"), 2);
    expect(screen.getByText("1 / 2")).toBeTruthy();
    expect(plusOf("Cola").disabled).toBe(true);
  });

  it("not sayacı n/500; 501 karakterde gönder pasif", () => {
    renderForm();
    fireEvent.click(plusOf("Water 0.5L"));
    next();
    fireEvent.change(noteField(), { target: { value: "x".repeat(12) } });
    expect(screen.getByText("12/500")).toBeTruthy();
    fireEvent.change(noteField(), { target: { value: "x".repeat(501) } });
    expect(screen.getByText("501/500")).toBeTruthy();
    expect((screen.getByRole("button", { name: SEND }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("başarılı gönderim: gövde {idempotencyKey, locale, items, removals, note}; ardından iki liste ve saat satırı, form yok", async () => {
    fetchMock.mockResolvedValueOnce(json(200, { ok: true, data: { requestId: "r1", duplicate: false, createdAt: "x" } }));
    fetchMock.mockResolvedValueOnce(statusBody("BEKLIYOR"));
    renderForm();
    clickTimes(plusOf("Water 0.5L"), 2);
    next();
    clickTimes(plusOf("Cola"), 1);
    fireEvent.change(noteField(), { target: { value: " more ice " } });
    fireEvent.click(screen.getByRole("button", { name: SEND }));
    await screen.findByText("Request received!");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/q/tok/mybar");
    expect(JSON.parse(String(init.body))).toEqual({
      idempotencyKey: expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/),
      locale: "en",
      items: [{ productId: "p2", qty: 1 }],
      removals: [{ productId: "p1", qty: 2 }],
      note: "more ice",
    });
    expect(screen.getByText("Pending")).toBeTruthy();
    expect(screen.getByText("To be taken out")).toBeTruthy();
    expect(screen.getByText("To be added")).toBeTruthy();
    expect(screen.getByText("Your request will be taken care of between 09:00 and 18:00.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: SEND })).toBeNull();
    // canlı akış: durum ekranı mybar olaylarına abone olur
    expect(FakeEventSource.instances[0]?.url).toBe("/api/q/tok/events");
  });

  it("hiç eklemeden gönderim: items boş, removals dolu", async () => {
    fetchMock.mockResolvedValueOnce(json(200, { ok: true, data: { requestId: "r1", duplicate: false, createdAt: "x" } }));
    fetchMock.mockResolvedValueOnce(statusBody("BEKLIYOR"));
    renderForm();
    fireEvent.click(plusOf("Water 0.5L"));
    next();
    fireEvent.click(screen.getByRole("button", { name: SEND }));
    await screen.findByText("Request received!");
    const body = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body));
    expect(body.items).toEqual([]);
    expect(body.removals).toEqual([{ productId: "p1", qty: 1 }]);
  });

  it("ağ hatasında ikinci deneme AYNI idempotencyKey ile gider", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("network"));
    fetchMock.mockResolvedValueOnce(json(200, { ok: true, data: { requestId: "r1", duplicate: true, createdAt: "x" } }));
    fetchMock.mockResolvedValueOnce(statusBody("BEKLIYOR"));
    renderForm();
    fireEvent.click(plusOf("Water 0.5L"));
    next();
    fireEvent.click(screen.getByRole("button", { name: SEND }));
    expect((await screen.findByRole("alert")).textContent).toBe("Could not connect. Please try again.");
    fireEvent.click(screen.getByRole("button", { name: SEND }));
    await screen.findByText("Request received!");
    const keys = fetchMock.mock.calls.slice(0, 2).map(([, init]) => JSON.parse(String((init as RequestInit).body)).idempotencyKey);
    expect(keys[0]).toBe(keys[1]);
  });

  it("sunucu removals doğrulama hatası errRemovals olarak görünür", async () => {
    fetchMock.mockResolvedValueOnce(json(400, { ok: false, error: { code: "VALIDATION", fieldErrors: { removals: ["Su"] } } }));
    renderForm();
    fireEvent.click(plusOf("Water 0.5L"));
    next();
    fireEvent.click(screen.getByRole("button", { name: SEND }));
    expect((await screen.findByRole("alert")).textContent).toContain("no longer in your minibar");
  });

  it("DAILY_LIMIT: err409Daily gösterilir, başarı kutusu yok, mevcut talebin durumu görünür", async () => {
    fetchMock.mockResolvedValueOnce(json(409, { ok: false, error: { code: "DAILY_LIMIT", message: "Bugün bu odadan talep gönderildi" } }));
    fetchMock.mockResolvedValueOnce(statusBody("BEKLIYOR"));
    renderForm();
    fireEvent.click(plusOf("Water 0.5L"));
    next();
    fireEvent.click(screen.getByRole("button", { name: SEND }));
    expect((await screen.findByRole("alert")).textContent).toContain("A request was already sent from this room today.");
    expect(screen.queryByText("Request received!")).toBeNull();
    expect(screen.getByText("Pending")).toBeTruthy();
  });

  it("DAILY_LIMIT ve talep okunamıyorsa form kalır, hata görünür", async () => {
    fetchMock.mockResolvedValueOnce(json(409, { ok: false, error: { code: "DAILY_LIMIT", message: "x" } }));
    fetchMock.mockResolvedValueOnce(statusBody(null));
    renderForm();
    fireEvent.click(plusOf("Water 0.5L"));
    next();
    fireEvent.click(screen.getByRole("button", { name: SEND }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Only one request per day"));
    expect(screen.getByRole("button", { name: SEND })).toBeTruthy();
  });

  it("bugünün talebi varken açılışta günlük sınır mesajı ve durum görünür; yeni talep düğmesi yok; intro açılmaz", () => {
    sessionStorage.clear();
    renderForm({ initial: { status: "GORULDU" } });
    expect(screen.getByText("Seen")).toBeTruthy();
    expect(screen.getByTestId("mybar-daily-limit").textContent).toContain("Only one request per day is possible.");
    expect(screen.queryByRole("button", { name: "Send a new request" })).toBeNull();
    expect(screen.queryByTestId("mybar-intro")).toBeNull();
  });

  it("iptal edilmiş talep: Cancelled ve yeni talep düğmesi; düğme formu açar (adım 1)", () => {
    renderForm({ initial: { status: "IPTAL" } });
    expect(screen.getByText("Cancelled")).toBeTruthy();
    expect(screen.queryByTestId("mybar-daily-limit")).toBeNull();
    expect(screen.queryByText("Your request will be taken care of between 09:00 and 18:00.")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Send a new request" }));
    expect(screen.getByText("Step 1 / 2")).toBeTruthy();
  });

  it("canlı olay: mybar.seen sonrası durum yeniden okunur ve Seen olur", async () => {
    fetchMock.mockResolvedValueOnce(statusBody("GORULDU"));
    renderForm({ initial: { status: "BEKLIYOR" } });
    expect(screen.getByText("Pending")).toBeTruthy();
    FakeEventSource.instances[0].listeners.get("mybar.seen")?.();
    await screen.findByText("Seen");
    expect(String(fetchMock.mock.calls[0][0])).toBe("/api/q/tok/mybar?locale=en");
  });

  it("ürünsüz oda tipi: noSetupMessage, adım yok, boş gönderim uyarır, yalnız notla gönderim", async () => {
    fetchMock.mockResolvedValueOnce(json(200, { ok: true, data: { requestId: "r1", duplicate: false, createdAt: "x" } }));
    fetchMock.mockResolvedValueOnce(statusBody("BEKLIYOR"));
    render(wrap(<MybarForm token="tok" locale="en" catalog={{ quantityMode: "QTY", groups: [] }} dailyLimit initialRequest={null} />));
    expect(screen.getByTestId("mybar-no-setup")).toBeTruthy();
    expect(screen.queryByTestId("mybar-intro")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: SEND }));
    expect((await screen.findByRole("alert")).textContent).toBe("Please select at least one item or write a note.");
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.change(noteField(), { target: { value: "extra towels" } });
    fireEvent.click(screen.getByRole("button", { name: SEND }));
    await screen.findByText("Request received!");
    const body = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body));
    expect(body.items).toEqual([]);
    expect(body.removals).toEqual([]);
  });

  it("fiyat ve alışveriş dili yok", () => {
    const { container } = renderForm();
    expect(container.textContent).not.toMatch(/₺|€|\$|price|cart|basket|sepet|order/i);
  });
});

describe("MybarForm tanıtım penceresi", () => {
  const dialog = () => screen.getByTestId("mybar-intro") as HTMLDialogElement;

  it("oturumda ilk açılışta görünür: başlık, açıklama ve 09:00 – 18:00 satırı; başlat düğmesi kapatır ve bir daha açılmaz", () => {
    sessionStorage.clear();
    const { unmount } = renderForm();
    expect(dialog().open).toBe(true);
    expect(within(dialog()).getByRole("heading", { name: "Your minibar, made personal" })).toBeTruthy();
    expect(dialog().textContent).toContain("Our minibar team takes care of your request between 09:00 and 18:00.");
    expect(dialog().textContent).not.toMatch(/₺|€|\$|price|cart|basket|sepet|order/i);
    fireEvent.click(within(dialog()).getByRole("button", { name: "Let's begin" }));
    expect(dialog().open).toBe(false);
    unmount();
    renderForm();
    expect(dialog().open).toBe(false);
  });

  it("kapat düğmesi, Esc ve arka plana tıklama kapatır; 'How does MyBar work?' yeniden açar", () => {
    sessionStorage.clear();
    renderForm();
    fireEvent.click(within(dialog()).getByRole("button", { name: "Close" }));
    expect(dialog().open).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "How does MyBar work?" }));
    expect(dialog().open).toBe(true);
    fireEvent(dialog(), new Event("cancel", { cancelable: true }));
    expect(dialog().open).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "How does MyBar work?" }));
    expect(dialog().open).toBe(true);
    fireEvent.click(within(dialog()).getByText("Your minibar, made personal")); // içerik tıklaması kapatmaz
    expect(dialog().open).toBe(true);
    fireEvent.click(dialog()); // arka plan
    expect(dialog().open).toBe(false);
  });

  it("sessionStorage kullanılamıyorsa da render olur ve açılır", () => {
    const spy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    renderForm();
    expect(dialog().open).toBe(true);
    spy.mockRestore();
  });
});

describe("RoomFrame", () => {
  const frame = (locale: Locale, info = "", chooser = false) =>
    render(
      wrap(
        <RoomFrame token="tok" locale={locale} hotelName="Merit Royal" logoUrl={null} roomNumber="101" info={info} chooser={chooser}>
          <p>body</p>
        </RoomFrame>,
        locale,
      ),
    );

  it("seçim ekranında başlık tarafsızdır; hizmet sayfasında ve tek hizmette MyBar başlığı kalır", () => {
    layoutSegment.current = null;
    const home = frame("en", "", true);
    expect(home.container.querySelector(".mb-title")?.textContent).toBe("ROOM SERVICES");
    expect(home.container.querySelector(".mb-info")?.textContent).toContain("Welcome to Merit Royal room services");
    home.unmount();
    const single = frame("en", "", false);
    expect(single.container.querySelector(".mb-title")?.textContent).toBe("MYBAR");
    single.unmount();
    layoutSegment.current = "mybar";
    const service = frame("en", "", true);
    expect(service.container.querySelector(".mb-title")?.textContent).toBe("MYBAR");
    service.unmount();
    layoutSegment.current = "oda-servisi";
    const roomService = frame("en", "", true);
    expect(roomService.container.querySelector(".mb-title")?.textContent).toBe("ROOM SERVICE MENU");
    expect(roomService.container.querySelector(".mb-info")).toBeNull();
    roomService.unmount();
    layoutSegment.current = null;
    // Odanın kendi mesajı her ekranda varsayılan cümlenin yerini alır.
    expect(frame("en", "Hoş geldiniz Bay Demir", true).container.querySelector(".mb-info")?.textContent).toBe("Hoş geldiniz Bay Demir");
  });

  it("ar: dir=rtl, lang=ar, Arapça başlık/oda rozeti", () => {
    const { container } = frame("ar");
    const root = container.querySelector("[data-room-frame]");
    expect(root?.getAttribute("dir")).toBe("rtl");
    expect(root?.getAttribute("lang")).toBe("ar");
    expect(root?.textContent).toContain("غرفة 101");
    expect(document.documentElement.dir).toBe("rtl");
  });

  it("en: dir=ltr; logo yoksa otel adı; bilgi kutusu varsayılan cümle, oda mesajı varsa o", () => {
    const { container } = frame("en");
    expect(container.querySelector("[data-room-frame]")?.getAttribute("dir")).toBe("ltr");
    expect(screen.getByText("Merit Royal", { selector: "p.mb-hotel-name" })).toBeTruthy();
    expect(container.querySelector(".mb-info")?.textContent).toContain("Personalise your Merit Royal minibar");
    cleanup();
    const second = frame("en", "Pool closes at 20:00");
    expect(second.container.querySelector(".mb-info")?.textContent).toBe("Pool closes at 20:00");
  });

  it("dil seçimi localStorage'a yazılır ve lang rotasına gider", () => {
    const hrefs: string[] = [];
    vi.stubGlobal("location", {
      get href() {
        return "http://localhost/q/tok";
      },
      set href(value: string) {
        hrefs.push(value);
      },
    });
    frame("en");
    fireEvent.click(screen.getByRole("button", { name: /Language/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: /العربية/ }));
    expect(window.localStorage.getItem("merit.guest.lang")).toBe("ar");
    expect(hrefs).toEqual(["/api/q/tok/lang?lang=ar"]);
  });
});
