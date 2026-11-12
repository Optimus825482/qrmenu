// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReportCatalogItem } from "@/modules/reporting/server/types";

const listMock = vi.hoisted(() => vi.fn());
const runMock = vi.hoisted(() => vi.fn());
const lookupMock = vi.hoisted(() => vi.fn());
vi.mock("@/modules/reporting/server/actions/reports", () => ({ listReportsAction: listMock, runReportAction: runMock }));
vi.mock("@/modules/reporting/server/actions/reportLookups", () => ({ reportLookupsAction: lookupMock }));

const { ReportCenter } = await import("@/modules/reporting/ui/ReportCenter");
const { buildExportUrl, buildRequest, filenameFrom } = await import("@/modules/reporting/ui/reportQuery");
const { formatCell } = await import("@/modules/reporting/ui/reportFormat");

const item = (over: Partial<ReportCatalogItem> = {}): ReportCatalogItem => ({
  key: "tuketim",
  group: "MINIBAR",
  title: "Tüketim",
  description: "Ürün bazında tüketim",
  mode: "FULL",
  dateMode: "range",
  outletScoped: false,
  hotelIds: ["h1", "h2"],
  paramFields: [
    {
      name: "groupBy",
      label: "Gruplama",
      type: "select",
      default: "urun",
      options: [
        { value: "urun", label: "Ürün" },
        { value: "oda", label: "Oda" },
      ],
    },
    { name: "productGroupId", label: "Ürün grubu", type: "text" },
    { name: "q", label: "Oda no / ürün adı", type: "text" },
    { name: "onlyCritical", label: "Yalnız kritik", type: "boolean", default: false },
  ],
  ...over,
});
const zimmet = item({ key: "zimmet-durum", title: "Zimmet Durumu", dateMode: "asOf", hotelIds: ["h1"], paramFields: [] });
const menu = item({ key: "menu-durum", group: "QR_MENU", title: "Menü Durumu", dateMode: "none", paramFields: [], hotelIds: ["h1"] });

const lookups = {
  hotels: [
    { id: "h1", name: "Merit Royal" },
    { id: "h2", name: "Merit Park" },
  ],
  outlets: [],
  floors: [],
  productGroups: [{ id: "pg1", name: "İçecek" }],
  products: [],
  users: [],
};

const result = (over: Record<string, unknown> = {}) => ({
  key: "tuketim",
  title: "Tüketim",
  generatedAt: new Date("2026-11-07T11:32:05Z"),
  hotels: [],
  from: "2026-11-01",
  to: "2026-11-07",
  paramsEcho: [],
  truncated: false,
  columns: [
    { key: "urun", title: "Ürün", type: "text" },
    { key: "adet", title: "Adet", type: "int", total: "sum" },
    { key: "sure", title: "Süre", type: "minutes" },
  ],
  rows: [
    { urun: "Kola", adet: 1200, sure: 4 },
    { urun: "Su", adet: 30, sure: 2.25 },
  ],
  summary: [{ label: "Toplam satır", value: 2 }],
  ...over,
});

const open = async (name = "Tüketim") => fireEvent.click(await screen.findByRole("button", { name }));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-07T10:00:00Z"));
  listMock.mockReset().mockResolvedValue({ ok: true, data: [item(), zimmet, menu] });
  lookupMock.mockReset().mockResolvedValue({ ok: true, data: lookups });
  runMock.mockReset().mockResolvedValue({ ok: true, data: result() });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("ReportCenter — katalog", () => {
  it("raporlar modüle göre gruplanır; boş katalogda mesaj", async () => {
    render(<ReportCenter />);
    const nav = await screen.findByRole("navigation", { name: "Raporlar" });
    const minibar = within(nav).getByRole("region", { name: "Minibar Operasyonları" });
    expect(within(nav).getByRole("region", { name: "QR Menü & Misafir İlgi Analizi" })).toBeTruthy();
    expect(within(minibar).getAllByRole("button").map((b) => b.textContent)).toEqual(["Tüketim", "Zimmet Durumu"]);
    cleanup();
    listMock.mockResolvedValue({ ok: true, data: [] });
    render(<ReportCenter />);
    expect(await screen.findByText("Yetkili olduğunuz rapor yok")).toBeTruthy();
  });

  it("yalnız raporun izinli otelleri kutu olarak çıkar; Bu ay varsayılan", async () => {
    render(<ReportCenter />);
    await open("Zimmet Durumu");
    await waitFor(() => expect(within(screen.getByRole("group", { name: "Oteller" })).getByLabelText("Merit Royal")).toBeTruthy());
    expect(within(screen.getByRole("group", { name: "Oteller" })).getAllByRole("checkbox")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Tüketim" }));
    expect(within(screen.getByRole("group", { name: "Oteller" })).getAllByRole("checkbox")).toHaveLength(2);
    expect((screen.getByLabelText("Başlangıç") as HTMLInputElement).value).toBe("2026-11-01");
    expect((screen.getByLabelText("Bitiş") as HTMLInputElement).value).toBe("2026-11-07");
  });

  it("initialKey raporu doğrudan açar", async () => {
    render(<ReportCenter initialKey="menu-durum" />);
    expect(await screen.findByRole("heading", { name: "Menü Durumu" })).toBeTruthy();
  });
});

describe("ReportCenter — filtreler", () => {
  it("ön ayarlar tarihleri doldurur; elle düzenleme Özel yapar", async () => {
    render(<ReportCenter />);
    await open();
    fireEvent.click(screen.getByRole("button", { name: "Dün" }));
    expect((screen.getByLabelText("Başlangıç") as HTMLInputElement).value).toBe("2026-11-06");
    expect((screen.getByLabelText("Bitiş") as HTMLInputElement).value).toBe("2026-11-06");
    fireEvent.click(screen.getByRole("button", { name: "Son 30 gün" }));
    expect((screen.getByLabelText("Başlangıç") as HTMLInputElement).value).toBe("2026-10-09");
    fireEvent.change(screen.getByLabelText("Başlangıç"), { target: { value: "2026-10-20" } });
    expect(screen.getByRole("button", { name: "Özel" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "Son 30 gün" }).getAttribute("aria-pressed")).toBe("false");
  });

  it("asOf ve none raporlarında tarih alanları devre dışı", async () => {
    render(<ReportCenter />);
    await open("Zimmet Durumu");
    expect((screen.getByLabelText("Başlangıç") as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByLabelText("Bitiş") as HTMLInputElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Menü Durumu" }));
    expect((screen.getByLabelText("Başlangıç") as HTMLInputElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Tüketim" }));
    expect((screen.getByLabelText("Başlangıç") as HTMLInputElement).disabled).toBe(false);
  });

  it("paramFields: select, metin, onay kutusu; kimlik alanı arama varsa select olur", async () => {
    render(<ReportCenter />);
    await open();
    const groupBy = screen.getByLabelText("Gruplama") as HTMLSelectElement;
    expect(groupBy.tagName).toBe("SELECT");
    expect(groupBy.value).toBe("urun");
    expect((screen.getByLabelText("Oda no / ürün adı") as HTMLInputElement).type).toBe("text");
    expect((screen.getByLabelText("Yalnız kritik") as HTMLInputElement).type).toBe("checkbox");
    const pg = await waitFor(() => {
      const el = screen.getByLabelText("Ürün grubu");
      expect(el.tagName).toBe("SELECT");
      return el as HTMLSelectElement;
    });
    expect(Array.from(pg.options).map((o) => o.textContent)).toEqual(["Tümü", "İçecek"]);
  });

  it("SELF modunda userId alanı gizlenir", async () => {
    listMock.mockResolvedValue({
      ok: true,
      data: [item({ mode: "SELF", paramFields: [{ name: "userId", label: "Personel", type: "text" }] })],
    });
    render(<ReportCenter />);
    await open();
    expect(screen.queryByLabelText("Personel")).toBeNull();
  });

  it("başlangıç bitişten sonraysa uyarı ve Göster pasif", async () => {
    render(<ReportCenter />);
    await open();
    fireEvent.change(screen.getByLabelText("Başlangıç"), { target: { value: "2026-11-09" } });
    expect(screen.getByRole("alert").textContent).toContain("Başlangıç tarihi bitişten sonra olamaz");
    expect((screen.getByRole("button", { name: "Raporu Göster" }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("ReportCenter — çalıştırma ve sonuç", () => {
  it("istek gövdesi, sonuç, özet, toplam ve 1 ondalık dakika", async () => {
    render(<ReportCenter />);
    await open();
    fireEvent.change(screen.getByLabelText("Oda no / ürün adı"), { target: { value: "kola" } });
    fireEvent.click(screen.getByRole("button", { name: "Raporu Göster" }));
    await screen.findByText("Kola");
    expect(runMock).toHaveBeenCalledWith("tuketim", {
      hotelIds: ["h1", "h2"],
      from: "2026-11-01",
      to: "2026-11-07",
      params: { groupBy: "urun", q: "kola", onlyCritical: false },
    });
    expect(screen.getByText("1.200")).toBeTruthy();
    expect(screen.getByText("4,0")).toBeTruthy();
    expect(screen.getByText("2,3")).toBeTruthy();
    expect(within(screen.getByLabelText("Özet")).getByText("Toplam satır")).toBeTruthy();
    expect(screen.getByTestId("rc-totals").textContent).toContain("1.230");
    expect(screen.getByText(/2 satır · üretim 13:32:05/)).toBeTruthy();
    expect(screen.queryByTestId("rc-truncated")).toBeNull();
  });

  it("sütun başlığı bütün sonucu sıralar: sayı önce büyükten küçüğe, metin A'dan Z'ye; sayfa boyu varsayılan 25", async () => {
    const rows = Array.from({ length: 30 }, (_, i) => ({ urun: `Ürün ${String(i + 1).padStart(2, "0")}`, adet: i + 1, sure: 1 }));
    runMock.mockResolvedValue({ ok: true, data: result({ rows }) });
    render(<ReportCenter />);
    await open();
    fireEvent.click(screen.getByRole("button", { name: "Raporu Göster" }));
    await screen.findByText("Ürün 01");
    const names = () => screen.getAllByRole("row").slice(1).map((row) => within(row).getAllByRole("gridcell")[0].textContent);

    // 25 of the 30 rows on the first page.
    expect(names()).toHaveLength(25);
    expect(screen.getByText("Sayfa 1 / 2")).toBeTruthy();
    expect((screen.getByLabelText("Sayfa başına kayıt") as HTMLSelectElement).value).toBe("25");

    // A number column starts from the largest, over the whole result (row 30 was on page 2).
    fireEvent.click(screen.getByRole("columnheader", { name: /Adet/ }));
    expect(names()[0]).toBe("Ürün 30");
    fireEvent.click(screen.getByRole("columnheader", { name: /Adet/ }));
    expect(names()[0]).toBe("Ürün 01");

    // A text column starts from A, then Z.
    fireEvent.click(screen.getByRole("columnheader", { name: /Ürün/ }));
    expect(names()[0]).toBe("Ürün 01");
    fireEvent.click(screen.getByRole("columnheader", { name: /Ürün/ }));
    expect(names()[0]).toBe("Ürün 30");

    fireEvent.change(screen.getByLabelText("Sayfa başına kayıt"), { target: { value: "50" } });
    expect(names()).toHaveLength(30);
    expect(screen.getByText("Sayfa 1 / 1")).toBeTruthy();
  });

  it("kesilmiş sonuçta kesildi şeridi", async () => {
    runMock.mockResolvedValue({ ok: true, data: result({ truncated: true }) });
    render(<ReportCenter />);
    await open();
    fireEvent.click(screen.getByRole("button", { name: "Raporu Göster" }));
    const notice = await screen.findByTestId("rc-truncated");
    expect(notice.textContent).toContain("İlk 2 satır gösteriliyor");
    expect(notice.textContent).toContain("Excel veya PDF");
    expect(notice.textContent).toContain("kesildi");
  });

  it("sunucu hatası uyarı olarak gösterilir", async () => {
    runMock.mockResolvedValue({ ok: false, error: { code: "FORBIDDEN", message: "Bu rapora erişim yetkiniz yok" } });
    render(<ReportCenter />);
    await open();
    fireEvent.click(screen.getByRole("button", { name: "Raporu Göster" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Bu rapora erişim yetkiniz yok");
  });

  it("satır yoksa boş durum", async () => {
    runMock.mockResolvedValue({ ok: true, data: result({ rows: [], summary: undefined }) });
    render(<ReportCenter />);
    await open();
    fireEvent.click(screen.getByRole("button", { name: "Raporu Göster" }));
    expect(await screen.findByText("Bu filtrelerle satır bulunamadı")).toBeTruthy();
  });
});

describe("indirme", () => {
  const filters = { hotelIds: ["h1", "h2"], from: "2026-11-01", to: "2026-11-07", outletId: "", params: { groupBy: "urun", q: "", onlyCritical: true } };

  it("URL: format, oteller, tarih ve p.<param>; boş metin atlanır; asOf tarihsiz", () => {
    expect(buildExportUrl(item(), filters, "xlsx")).toBe(
      "/api/reports/tuketim/export?format=xlsx&hotelIds=h1,h2&from=2026-11-01&to=2026-11-07&p.groupBy=urun&p.onlyCritical=true",
    );
    expect(buildExportUrl(zimmet, { ...filters, outletId: "o1", params: {} }, "pdf")).toBe(
      "/api/reports/zimmet-durum/export?format=pdf&hotelIds=h1,h2",
    );
    expect(buildExportUrl(item({ outletScoped: true }), { ...filters, outletId: "o1" }, "pdf")).toContain("&outletId=o1&");
    const self = item({ mode: "SELF", paramFields: [{ name: "userId", label: "x", type: "text" }] });
    expect(buildRequest(self, { ...filters, params: { userId: "u9" } }).params).toEqual({});
  });

  it("Excel bağlantısı filtreleri taşır; tıklama dosyayı indirir", async () => {
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: () => "blob:x", revokeObjectURL: vi.fn() }));
    const disposition = "attachment; filename=\"rapor.xlsx\"; filename*=UTF-8''rapor-tuketim-2026-11.xlsx";
    const fetchMock = vi.fn().mockResolvedValue(new Response(new Blob(["x"]), { status: 200, headers: { "Content-Disposition": disposition } }));
    vi.stubGlobal("fetch", fetchMock);
    const clicks: string[] = [];
    const orig = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
      clicks.push(this.download);
    };
    try {
      render(<ReportCenter />);
      await open();
      const link = screen.getByRole("button", { name: "Excel" });
      expect(link.getAttribute("href")).toContain("format=xlsx&hotelIds=h1,h2&from=2026-11-01&to=2026-11-07&p.groupBy=urun");
      fireEvent.click(link);
      await waitFor(() => expect(clicks).toEqual(["rapor-tuketim-2026-11.xlsx"]));
      expect(fetchMock.mock.calls[0][0]).toBe(link.getAttribute("href"));
    } finally {
      HTMLAnchorElement.prototype.click = orig;
    }
  });

  it("403 { error } yanıtı banner olarak gösterilir", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "Bu rapora erişim yetkiniz yok" }), { status: 403 })));
    render(<ReportCenter />);
    await open();
    fireEvent.click(screen.getByRole("button", { name: "PDF" }));
    expect((await screen.findByTestId("rc-download-error")).textContent).toBe("Bu rapora erişim yetkiniz yok");
  });

  it("dosya adı ayrıştırma ve biçimleyiciler", () => {
    expect(filenameFrom(null, "f.xlsx")).toBe("f.xlsx");
    expect(filenameFrom('attachment; filename="a.pdf"', "f")).toBe("a.pdf");
    expect(formatCell("percent", 0.125)).toBe("%12,5");
    expect(formatCell("money", 12.5)).toBe("12,50");
    expect(formatCell("date", "2026-11-01")).toBe("01.11.2026");
  });
});

describe("mobil düzen", () => {
  it("katalog kartları; rapor açınca aynı filtreler, kart satırları ve geri düğmesi", async () => {
    render(<ReportCenter variant="mobile" />);
    expect(await screen.findByRole("heading", { name: "Raporlar" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Tüketim/ }));
    expect(screen.getByRole("group", { name: "Tarih ön ayarları" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Raporu Göster" }));
    const list = await screen.findByRole("list", { name: "Sonuç satırları" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: /← Raporlar/ }));
    expect(screen.getByRole("navigation", { name: "Raporlar" })).toBeTruthy();
  });
});
