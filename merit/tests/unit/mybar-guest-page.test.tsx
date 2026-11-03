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

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));

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
    data: { request: status ? { requestId: "r1", status, createdAt: "2026-11-03T08:00:00Z", items: [{ name: "Water 0.5L", qty: 2 }] } : null },
  });

beforeEach(() => {
  FakeEventSource.instances = [];
  vi.stubGlobal("EventSource", FakeEventSource);
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
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
            ? ({ requestId: "r1", status: opts.initial.status, createdAt: "2026-11-03T08:00:00Z", items: [{ name: "Water 0.5L", qty: 2 }] } as never)
            : null
        }
      />,
    ),
  );

describe("MybarForm", () => {
  it("ilk grup paneli açık; hap tıklanınca panel değişir", () => {
    renderForm();
    expect(screen.getByRole("tab", { name: "Drinks" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByText("Water 0.5L")).toBeTruthy();
    expect(screen.queryByText("Chips")).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: "Snacks" }));
    expect(screen.getByText("Chips")).toBeTruthy();
    expect(screen.queryByText("Water 0.5L")).toBeNull();
  });

  it("QTY: + iki kez 2, üst sınırda + pasif, 0'da − pasif; çip ×n ve çip × kaldırır", () => {
    renderForm();
    const plus = screen.getByRole("button", { name: "Add one Water 0.5L" });
    const minus = screen.getByRole("button", { name: "Remove one Water 0.5L" });
    expect((minus as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(plus);
    fireEvent.click(plus);
    expect((plus as HTMLButtonElement).disabled).toBe(true);
    const chips = screen.getByRole("region", { name: /Selected items/ });
    expect(chips.textContent).toContain("Water 0.5L");
    expect(chips.textContent).toContain("×2");
    fireEvent.click(within(chips).getByRole("button", { name: "Remove Water 0.5L" }));
    expect(screen.getByText("No product selected yet")).toBeTruthy();
  });

  it("TICK: işaret kutusu adedi 1 yapar ve çipte adet yazmaz", () => {
    renderForm({ mode: "TICK" });
    const box = screen.getByRole("checkbox", { name: "Select Cola" });
    expect(box.getAttribute("aria-checked")).toBe("false");
    fireEvent.click(box);
    expect(box.getAttribute("aria-checked")).toBe("true");
    const chips = screen.getByRole("region", { name: /Selected items/ });
    expect(chips.textContent).toContain("Cola");
    expect(chips.textContent).not.toContain("×");
  });

  it("boş gönderimde istek atılmaz ve validationEmpty görünür", async () => {
    renderForm();
    fireEvent.click(screen.getByRole("button", { name: /SEND MYBAR REQUEST/ }));
    expect((await screen.findByRole("alert")).textContent).toBe("Please select at least one item or write a note.");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("not sayacı n/500; 501 karakterde gönder pasif", () => {
    renderForm();
    const note = screen.getByLabelText("Additional notes or special requests");
    fireEvent.change(note, { target: { value: "x".repeat(12) } });
    expect(screen.getByText("12/500")).toBeTruthy();
    fireEvent.change(note, { target: { value: "x".repeat(501) } });
    expect(screen.getByText("501/500")).toBeTruthy();
    expect((screen.getByRole("button", { name: /SEND MYBAR REQUEST/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("başarılı gönderim: gövde {idempotencyKey, locale, items, note}; ardından durum ekranı (Pending), form yok", async () => {
    fetchMock.mockResolvedValueOnce(json(200, { ok: true, data: { requestId: "r1", duplicate: false, createdAt: "x" } }));
    fetchMock.mockResolvedValueOnce(statusBody("BEKLIYOR"));
    renderForm();
    const plus = screen.getByRole("button", { name: "Add one Water 0.5L" });
    fireEvent.click(plus);
    fireEvent.click(plus);
    fireEvent.change(screen.getByLabelText("Additional notes or special requests"), { target: { value: " more ice " } });
    fireEvent.click(screen.getByRole("button", { name: /SEND MYBAR REQUEST/ }));
    await screen.findByText("Request received!");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/q/tok/mybar");
    const body = JSON.parse(String(init.body));
    expect(body).toEqual({
      idempotencyKey: expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/),
      locale: "en",
      items: [{ productId: "p1", qty: 2 }],
      note: "more ice",
    });
    expect(screen.getByText("Pending")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /SEND MYBAR REQUEST/ })).toBeNull();
    // canlı akış: durum ekranı mybar olaylarına abone olur
    expect(FakeEventSource.instances[0]?.url).toBe("/api/q/tok/events");
  });

  it("ağ hatasında ikinci deneme AYNI idempotencyKey ile gider", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("network"));
    fetchMock.mockResolvedValueOnce(json(200, { ok: true, data: { requestId: "r1", duplicate: true, createdAt: "x" } }));
    fetchMock.mockResolvedValueOnce(statusBody("BEKLIYOR"));
    renderForm();
    fireEvent.click(screen.getByRole("button", { name: "Add one Water 0.5L" }));
    fireEvent.click(screen.getByRole("button", { name: /SEND MYBAR REQUEST/ }));
    expect((await screen.findByRole("alert")).textContent).toBe("Could not connect. Please try again.");
    fireEvent.click(screen.getByRole("button", { name: /SEND MYBAR REQUEST/ }));
    await screen.findByText("Request received!");
    const keys = fetchMock.mock.calls.slice(0, 2).map(([, init]) => JSON.parse(String((init as RequestInit).body)).idempotencyKey);
    expect(keys[0]).toBe(keys[1]);
  });

  it("DAILY_LIMIT: err409Daily gösterilir, başarı kutusu yok, mevcut talebin durumu görünür", async () => {
    fetchMock.mockResolvedValueOnce(json(409, { ok: false, error: { code: "DAILY_LIMIT", message: "Bugün bu odadan talep gönderildi" } }));
    fetchMock.mockResolvedValueOnce(statusBody("BEKLIYOR"));
    renderForm();
    fireEvent.click(screen.getByRole("button", { name: "Add one Water 0.5L" }));
    fireEvent.click(screen.getByRole("button", { name: /SEND MYBAR REQUEST/ }));
    expect((await screen.findByRole("alert")).textContent).toContain("A request was already sent from this room today.");
    expect(screen.queryByText("Request received!")).toBeNull();
    expect(screen.getByText("Pending")).toBeTruthy();
  });

  it("DAILY_LIMIT ve talep okunamıyorsa form kalır, hata görünür", async () => {
    fetchMock.mockResolvedValueOnce(json(409, { ok: false, error: { code: "DAILY_LIMIT", message: "x" } }));
    fetchMock.mockResolvedValueOnce(statusBody(null));
    renderForm();
    fireEvent.click(screen.getByRole("button", { name: "Add one Water 0.5L" }));
    fireEvent.click(screen.getByRole("button", { name: /SEND MYBAR REQUEST/ }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Only one request per day"));
    expect(screen.getByRole("button", { name: /SEND MYBAR REQUEST/ })).toBeTruthy();
  });

  it("bugünün talebi varken açılışta günlük sınır mesajı ve durum görünür; yeni talep düğmesi yok", () => {
    renderForm({ initial: { status: "GORULDU" } });
    expect(screen.getByText("Seen")).toBeTruthy();
    expect(screen.getByTestId("mybar-daily-limit").textContent).toContain("Only one request per day is possible.");
    expect(screen.queryByRole("button", { name: "Send a new request" })).toBeNull();
  });

  it("iptal edilmiş talep: Cancelled ve yeni talep düğmesi; düğme formu açar", () => {
    renderForm({ initial: { status: "IPTAL" } });
    expect(screen.getByText("Cancelled")).toBeTruthy();
    expect(screen.queryByTestId("mybar-daily-limit")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Send a new request" }));
    expect(screen.getByRole("button", { name: /SEND MYBAR REQUEST/ })).toBeTruthy();
  });

  it("canlı olay: mybar.seen sonrası durum yeniden okunur ve Seen olur", async () => {
    fetchMock.mockResolvedValueOnce(statusBody("GORULDU"));
    renderForm({ initial: { status: "BEKLIYOR" } });
    expect(screen.getByText("Pending")).toBeTruthy();
    FakeEventSource.instances[0].listeners.get("mybar.seen")?.();
    await screen.findByText("Seen");
    expect(String(fetchMock.mock.calls[0][0])).toBe("/api/q/tok/mybar?locale=en");
  });

  it("ürünsüz oda tipi: noSetupMessage ve yalnız notla gönderim", async () => {
    fetchMock.mockResolvedValueOnce(json(200, { ok: true, data: { requestId: "r1", duplicate: false, createdAt: "x" } }));
    fetchMock.mockResolvedValueOnce(statusBody("BEKLIYOR"));
    render(wrap(<MybarForm token="tok" locale="en" catalog={{ quantityMode: "QTY", groups: [] }} dailyLimit initialRequest={null} />));
    expect(screen.getByTestId("mybar-no-setup")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Additional notes or special requests"), { target: { value: "extra towels" } });
    fireEvent.click(screen.getByRole("button", { name: /SEND MYBAR REQUEST/ }));
    await screen.findByText("Request received!");
    expect(JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body)).items).toEqual([]);
  });

  it("fiyat ve alışveriş dili yok", () => {
    const { container } = renderForm();
    expect(container.textContent).not.toMatch(/₺|€|\$|price|cart|basket|sepet/i);
  });
});

describe("RoomFrame", () => {
  const frame = (locale: Locale, info = "") =>
    render(
      wrap(
        <RoomFrame token="tok" locale={locale} hotelName="Merit Royal" logoUrl={null} roomNumber="101" info={info}>
          <p>body</p>
        </RoomFrame>,
        locale,
      ),
    );

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
    expect(container.querySelector(".mb-info")?.textContent).toContain("Your Merit Royal minibar request");
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
