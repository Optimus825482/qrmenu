// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MeritEvent } from "@/lib/realtime-events";

let sseHandler: ((e: MeritEvent) => void) | undefined;
let sseTypes: readonly string[] | undefined;
vi.mock("@/shell/useSse", () => ({
  useSse: (cb: (e: MeritEvent) => void, types?: readonly string[]) => {
    sseHandler = cb;
    sseTypes = types;
    return { status: "open" };
  },
}));

const confirmMock = vi.hoisted(() => vi.fn());
vi.mock("@/shell/confirm", () => ({ confirm: confirmMock }));
vi.mock("@/shell/notify", () => ({ notify: { success: vi.fn(), error: vi.fn() } }));

const scopesMock = vi.hoisted(() => vi.fn());
const listMock = vi.hoisted(() => vi.fn());
const testMock = vi.hoisted(() => vi.fn());
const retryMock = vi.hoisted(() => vi.fn());
vi.mock("@/modules/reporting/server/actions/mail", () => ({
  mailScopesAction: scopesMock,
  listEmailLogAction: listMock,
  sendTestMailAction: testMock,
  retryEmailLogAction: retryMock,
}));

const { MailPanel } = await import("@/modules/reporting/ui/MailPanel");

const row = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  createdAt: "2026-11-06T10:00:00.000Z",
  to: `${id}@merit.test`,
  kind: "RAPOR_GOREV",
  template: "GOREV",
  hotelId: "h1",
  hotelName: "Merit Royal",
  subject: `Konu ${id}`,
  status: "GONDERILDI",
  attempts: 1,
  error: null,
  canRetry: false,
  ...over,
});

const smtp = { source: "system", host: "smtp.merit.test", port: 587, security: "STARTTLS", user: "p***", fromEmail: "n***@merit.test" };
const data = (over: Record<string, unknown> = {}) => ({
  scope: null,
  smtp,
  canAct: true,
  logs: [
    row("ok1"),
    row("bekle", { status: "BEKLEMEDE" }),
    row("hata1", { status: "HATA", attempts: 5, error: "Kimlik doğrulama başarısız", canRetry: true }),
    row("iptal", { status: "IPTAL" }),
  ],
  ...over,
});

beforeEach(() => {
  sseHandler = undefined;
  sseTypes = undefined;
  scopesMock.mockReset().mockResolvedValue({ ok: true, data: { system: { canAct: true }, hotels: [{ id: "h1", name: "Merit Royal", canAct: true }] } });
  listMock.mockReset().mockResolvedValue({ ok: true, data: data() });
  testMock.mockReset();
  retryMock.mockReset().mockResolvedValue({ ok: true, data: { id: "hata1" } });
  confirmMock.mockReset().mockResolvedValue(true);
});
afterEach(cleanup);

describe("MailPanel", () => {
  it("günlük satırları ve durum rozetleri; SMTP kaynağı maskeli", async () => {
    render(<MailPanel />);
    await screen.findByText("Konu ok1");
    const badges = Array.from(document.querySelectorAll(".xp-mail-badge")).map((b) => b.textContent);
    expect(badges).toEqual(["Gönderildi", "Bekliyor", "Hata", "İptal"]);
    const facts = screen.getByTestId("mail-smtp");
    expect(facts.textContent).toContain("Sistem ayarı");
    expect(facts.textContent).toContain("smtp.merit.test:587");
    expect(facts.textContent).toContain("n***@merit.test");
    expect(screen.getByText("Kimlik doğrulama başarısız")).toBeTruthy();
    expect(listMock).toHaveBeenCalledWith(null);
  });

  it("Tekrar kuyruğa al yalnız HATA satırında; onaydan sonra eylemi çağırır, onaysız çağırmaz", async () => {
    render(<MailPanel />);
    await screen.findByText("Konu hata1");
    const buttons = screen.getAllByRole("button", { name: "Tekrar kuyruğa al" });
    expect(buttons).toHaveLength(1);

    confirmMock.mockResolvedValueOnce(false);
    fireEvent.click(buttons[0]!);
    await waitFor(() => expect(confirmMock).toHaveBeenCalledTimes(1));
    expect(retryMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Tekrar kuyruğa al" }));
    await waitFor(() => expect(retryMock).toHaveBeenCalledWith("hata1"));
    await waitFor(() => expect(listMock).toHaveBeenCalledTimes(2)); // reloaded
  });

  it("test formu: başarıda banner, hatada Türkçe hata mesajı", async () => {
    testMock.mockResolvedValueOnce({ ok: true, data: { ok: false, code: "AUTH", message: "Kimlik doğrulama başarısız", to: "s***@merit.test", smtp } });
    render(<MailPanel />);
    await screen.findByText("Konu ok1");
    fireEvent.click(screen.getByRole("button", { name: "Test gönder" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("Kimlik doğrulama başarısız");
    expect(testMock).toHaveBeenCalledWith(null);

    testMock.mockResolvedValueOnce({ ok: true, data: { ok: true, messageId: "m1", to: "s***@merit.test", smtp } });
    fireEvent.click(screen.getByRole("button", { name: "Test gönder" }));
    const status = await screen.findByRole("status");
    expect(status.textContent).toContain("s***@merit.test");
  });

  it("SMTP eksikse uyarı satırı ve ayarlara yönlendirme düğmesi", async () => {
    listMock.mockResolvedValue({ ok: true, data: data({ smtp: null }) });
    const open = vi.fn();
    render(<MailPanel onOpenSettings={open} />);
    const warn = await screen.findByTestId("mail-smtp-missing");
    expect(warn.textContent).toContain("SMTP ayarları yapılmamış");
    fireEvent.click(within(warn).getByRole("button", { name: /Ayarlar/ }));
    expect(open).toHaveBeenCalled();
  });

  it("A yetkisi yoksa Test gönder ve yeniden deneme yok; durum süzgeci satırları daraltır", async () => {
    listMock.mockResolvedValue({ ok: true, data: data({ canAct: false }) });
    render(<MailPanel />);
    await screen.findByText("Konu ok1");
    expect(screen.queryByRole("button", { name: "Test gönder" })).toBeNull();
    fireEvent.change(screen.getByLabelText("Durum"), { target: { value: "HATA" } });
    expect(screen.queryByText("Konu ok1")).toBeNull();
    expect(screen.getByText("Konu hata1")).toBeTruthy();
  });

  it("kapsam seçici otel süzer; mail.failed olayı listeyi yeniler", async () => {
    render(<MailPanel />);
    await screen.findByText("Konu ok1");
    fireEvent.change(screen.getByLabelText("Kapsam"), { target: { value: "h1" } });
    await waitFor(() => expect(listMock).toHaveBeenLastCalledWith("h1"));
    expect(sseTypes).toEqual(["mail.failed"]);
    const before = listMock.mock.calls.length;
    sseHandler!({ type: "mail.failed", at: "2026-11-06T10:00:00.000Z" } as MeritEvent);
    await waitFor(() => expect(listMock.mock.calls.length).toBeGreaterThan(before));
  });

  it("kapsam yoksa yetki mesajı", async () => {
    scopesMock.mockResolvedValue({ ok: true, data: { system: null, hotels: [] } });
    render(<MailPanel />);
    await screen.findByText(/görme yetkiniz yok/);
  });
});
