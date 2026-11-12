// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MeritEvent } from "@/lib/realtime-events";
import type { MybarRow } from "@/modules/mybar/server/requests";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

let sseHandler: ((e: MeritEvent) => void) | null = null;
vi.mock("@/shell/useSse", () => ({
  useSse: (cb: (e: MeritEvent) => void) => {
    sseHandler = cb;
    return { status: "open" };
  },
}));

const playCue = vi.hoisted(() => vi.fn());
vi.mock("@/components/pos/soundGate", () => ({
  playCue,
  unlockAudio: vi.fn(),
  useSoundState: () => "on",
}));

const listUnseen = vi.hoisted(() => vi.fn());
const acknowledge = vi.hoisted(() => vi.fn());
const getMybar = vi.hoisted(() => vi.fn());
const listMybar = vi.hoisted(() => vi.fn());
const completeMybar = vi.hoisted(() => vi.fn());
const cancelMybar = vi.hoisted(() => vi.fn());
const fulfillMybar = vi.hoisted(() => vi.fn());
const getCaps = vi.hoisted(() => vi.fn());
vi.mock("@/modules/mybar/server/actions/ack", () => ({ listUnseenForAckAction: listUnseen }));
vi.mock("@/modules/mybar/server/actions/caps", () => ({ getMybarCapsAction: getCaps }));
vi.mock("@/modules/mybar/server/actions/fulfill", () => ({ fulfillMybarAction: fulfillMybar }));
vi.mock("@/modules/mybar/server/actions/requests", () => ({
  acknowledgeMybarAction: acknowledge,
  getMybarAction: getMybar,
  listMybarAction: listMybar,
  completeMybarAction: completeMybar,
  cancelMybarAction: cancelMybar,
}));
vi.mock("@/shell/confirm", () => ({ confirm: vi.fn(async () => true) }));
vi.mock("@/shell/notify", () => ({ notify: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

const { PersistentMybarModal } = await import("@/app/kat/components/PersistentMybarModal");
const { MybarList } = await import("@/modules/mybar/ui/staff/MybarList");
const { MybarWorkbench } = await import("@/modules/mybar/ui/staff/MybarWorkbench");
const { orderRows } = await import("@/modules/mybar/ui/staff/format");

const row = (over: Partial<MybarRow> & { id: string }): MybarRow => ({
  hotelId: "h1",
  roomId: `room-${over.id}`,
  roomNumber: over.id.toUpperCase(),
  floorName: "1. Kat",
  status: "BEKLEMEDE",
  createdAt: new Date("2026-11-03T10:00:00Z"),
  language: "tr",
  note: null,
  noteTr: null,
  noteSrcLang: null,
  seenAt: null,
  seenByName: null,
  completedAt: null,
  completedByName: null,
  closeNote: null,
  closedWithMissing: false,
  cancelledAt: null,
  cancelledByName: null,
  cancelNote: null,
  items: [{ productId: "su", name: "Su", requestedQty: 2, deliveredQty: 0, remainingQty: 2, poolRemaining: 10 }],
  ...over,
});

const ok = <T,>(data: T) => ({ ok: true as const, data });
const fail = (code: string, message: string, fieldErrors?: Record<string, string[]>) => ({
  ok: false as const,
  error: { code, message, fieldErrors },
});

beforeEach(() => {
  sseHandler = null;
  playCue.mockReset();
  for (const m of [listUnseen, acknowledge, getMybar, listMybar, completeMybar, cancelMybar, fulfillMybar, getCaps]) m.mockReset();
  getCaps.mockResolvedValue(ok({ canAct: true, canCancel: false }));
  listUnseen.mockResolvedValue(ok([]));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("PersistentMybarModal (zorunlu onay)", () => {
  it("kuyruk eskiden yeniye, sayaç 1/N ve 'N talep daha bekliyor'", async () => {
    listUnseen.mockResolvedValue(ok([row({ id: "a1" }), row({ id: "a2", roomNumber: "202" })]));
    render(<PersistentMybarModal />);
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText("Oda A1")).toBeTruthy();
    expect(screen.getByTestId("mybar-counter").textContent).toBe("1/2");
    expect(screen.getByTestId("mybar-more").textContent).toBe("1 talep daha bekliyor");
  });

  it("Escape ve arka plan tıklaması pencereyi kapatmaz", async () => {
    listUnseen.mockResolvedValue(ok([row({ id: "a1" })]));
    render(<PersistentMybarModal />);
    const dialog = await screen.findByRole("alertdialog");
    fireEvent.keyDown(window, { key: "Escape" });
    fireEvent.click(dialog.parentElement as Element);
    expect(screen.getByRole("alertdialog")).toBeTruthy();
  });

  it("Gördüm acknowledgeMybarAction çağırır ve sıradaki gelir", async () => {
    listUnseen.mockResolvedValue(ok([row({ id: "a1" }), row({ id: "a2", roomNumber: "202" })]));
    acknowledge.mockResolvedValue(ok({ firstSeen: true, seenAt: new Date() }));
    render(<PersistentMybarModal />);
    await screen.findByRole("alertdialog");
    fireEvent.click(screen.getByRole("button", { name: "Gördüm" }));
    await waitFor(() => expect(acknowledge).toHaveBeenCalledWith("a1"));
    await waitFor(() => expect(screen.getByText("Oda 202")).toBeTruthy());
    expect(screen.getByTestId("mybar-counter").textContent).toBe("1/1");
  });

  it("başka kullanıcı mybar.seen yayınlarsa o talep eylemsiz kuyruktan düşer", async () => {
    listUnseen.mockResolvedValue(ok([row({ id: "a1" }), row({ id: "a2", roomNumber: "202" })]));
    render(<PersistentMybarModal />);
    await screen.findByRole("alertdialog");
    act(() => {
      sseHandler?.({ type: "mybar.seen", at: new Date().toISOString(), hotelId: "h1", payload: { requestId: "a1" } });
    });
    await waitFor(() => expect(screen.getByText("Oda 202")).toBeTruthy());
    expect(acknowledge).not.toHaveBeenCalled();
  });

  it("mybar.created olayında listeyi sunucudan yeniden çeker", async () => {
    render(<PersistentMybarModal />);
    await waitFor(() => expect(listUnseen).toHaveBeenCalled());
    listUnseen.mockResolvedValue(ok([row({ id: "n1" })]));
    act(() => {
      sseHandler?.({
        type: "mybar.created",
        at: new Date().toISOString(),
        hotelId: "h1",
        payload: { requestId: "n1", roomId: "r", roomNumber: "N1" },
      });
    });
    expect(await screen.findByRole("alertdialog")).toBeTruthy();
  });

  it("eylem hatası pencerede iletide gösterilir, kuyruk değişmez", async () => {
    listUnseen.mockResolvedValue(ok([row({ id: "a1" })]));
    acknowledge.mockResolvedValue(fail("FORBIDDEN", "Bu işlem için yetkiniz yok"));
    render(<PersistentMybarModal />);
    await screen.findByRole("alertdialog");
    fireEvent.click(screen.getByRole("button", { name: "Gördüm" }));
    expect(await screen.findByText("Bu işlem için yetkiniz yok")).toBeTruthy();
    expect(screen.getByRole("alertdialog")).toBeTruthy();
  });

  it("noteTr varsa Türkçe metin önce gelir, Orijinali göster özgün notu açar", async () => {
    listUnseen.mockResolvedValue(ok([row({ id: "a1", note: "ice please", noteTr: "buz lütfen", noteSrcLang: "en" })]));
    render(<PersistentMybarModal />);
    await screen.findByRole("alertdialog");
    expect(screen.getByTestId("mybar-note").textContent).toBe("buz lütfen");
    fireEvent.click(screen.getByRole("button", { name: /Orijinali göster/ }));
    expect(screen.getByTestId("mybar-note").textContent).toBe("ice please");
  });

  it("ses ilk çıkışta çalar, 8 sn sonra tekrar eder, kuyruk boşalınca durur", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    listUnseen.mockResolvedValue(ok([row({ id: "a1" })]));
    acknowledge.mockResolvedValue(ok({ firstSeen: true, seenAt: new Date() }));
    render(<PersistentMybarModal />);
    await screen.findByRole("alertdialog");
    await waitFor(() => expect(playCue).toHaveBeenCalledTimes(1));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(8100);
    });
    expect(playCue.mock.calls.length).toBeGreaterThanOrEqual(2);
    fireEvent.click(screen.getByRole("button", { name: "Gördüm" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    const before = playCue.mock.calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000);
    });
    expect(playCue.mock.calls.length).toBe(before);
  });
});

describe("MybarList sıralaması", () => {
  it("orderRows: bekleyenler önce (görülmeyen üstte, eskiden yeniye), sonra kapananlar yeniden eskiye", () => {
    const rows = [
      row({ id: "done-old", status: "TAMAMLANDI", createdAt: new Date("2026-11-01T10:00:00Z") }),
      row({ id: "seen", seenAt: new Date(), createdAt: new Date("2026-11-03T08:00:00Z") }),
      row({ id: "unseen-new", createdAt: new Date("2026-11-03T11:00:00Z") }),
      row({ id: "unseen-old", createdAt: new Date("2026-11-03T09:00:00Z") }),
      row({ id: "cancel-new", status: "IPTAL", createdAt: new Date("2026-11-02T10:00:00Z") }),
    ];
    const { waiting, recent } = orderRows(rows);
    expect(waiting.map((r) => r.id)).toEqual(["unseen-old", "unseen-new", "seen"]);
    expect(recent.map((r) => r.id)).toEqual(["cancel-new", "done-old"]);
  });

  it("liste iki bölüm çizer; satıra dokununca ayrıntı açılır ve fiyat gösterilmez", async () => {
    getMybar.mockResolvedValue(ok(row({ id: "w1", roomNumber: "101", note: "x" })));
    render(
      <MybarList
        hotelId="h1"
        canCancel={false}
        initial={[
          row({ id: "w1", roomNumber: "101", note: "x" }),
          row({ id: "d1", roomNumber: "102", status: "TAMAMLANDI" }),
        ]}
      />,
    );
    expect(screen.getByRole("heading", { name: /Bekleyen/ })).toBeTruthy();
    expect(screen.getByRole("heading", { name: /Son 7 gün/ })).toBeTruthy();
    const rows = screen.getAllByTestId("mybar-row");
    expect(rows.map((r) => r.getAttribute("data-room"))).toEqual(["101", "102"]);
    fireEvent.click(within(rows[0]!).getByRole("button", { expanded: false }));
    await screen.findByTestId("mybar-detail");
    expect(document.body.textContent).not.toMatch(/₺|\$|€|fiyat/i);
  });
});

describe("Karşılama ve kapatma", () => {
  const twoItems = () =>
    row({
      id: "w1",
      roomNumber: "101",
      seenAt: new Date(),
      items: [
        { productId: "su", name: "Su", requestedQty: 2, deliveredQty: 0, remainingQty: 2, poolRemaining: 10 },
        { productId: "kola", name: "Kola", requestedQty: 1, deliveredQty: 0, remainingQty: 1, poolRemaining: 0 },
      ],
    });

  it("kalem adedi varsayılan istenen, havuz 0 kalem pasif; Seçilenleri Ekle yalnız seçileni yollar", async () => {
    getMybar.mockResolvedValue(ok(twoItems()));
    fulfillMybar.mockResolvedValue(ok({ added: [{ productId: "su", name: "Su", qty: 1 }], fullyDelivered: false }));
    render(<MybarWorkbench requestId="w1" canCancel={false} />);
    await screen.findByTestId("fulfill-panel");
    const su = screen.getByTestId("fulfill-line-su");
    expect(su.querySelector("output")?.textContent).toBe("2");
    const kola = screen.getByTestId("fulfill-line-kola");
    expect(within(kola).getByText("Depoda yok")).toBeTruthy();
    expect((within(kola).getByRole("button", { name: "Kola artır" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(within(su).getByRole("button", { name: "Su azalt" }));
    fireEvent.click(screen.getByRole("button", { name: "Seçilenleri Ekle" }));
    await waitFor(() => expect(fulfillMybar).toHaveBeenCalledWith("w1", { lines: [{ productId: "su", qty: 1 }] }));
  });

  it("Tümünü Karşıla all:true yollar; yetersiz stok mesajı panelde görünür", async () => {
    getMybar.mockResolvedValue(ok(twoItems()));
    fulfillMybar.mockResolvedValue(fail("STOCK_INSUFFICIENT", "Kola: Stokta 1 adet var"));
    render(<MybarWorkbench requestId="w1" canCancel={false} />);
    await screen.findByTestId("fulfill-panel");
    fireEvent.click(screen.getByRole("button", { name: "Tümünü Karşıla" }));
    await waitFor(() => expect(fulfillMybar).toHaveBeenCalledWith("w1", { all: true }));
    expect((await screen.findByTestId("fulfill-error")).textContent).toBe("Kola: Stokta 1 adet var");
  });

  it("eksik varken kapatma: onay kutusu ve 3 kelimelik açıklama olmadan gönderilemez, kural göstergesi canlı", async () => {
    getMybar.mockResolvedValue(ok(twoItems()));
    completeMybar.mockResolvedValue(ok({ closedWithMissing: true }));
    render(<MybarWorkbench requestId="w1" canCancel={false} />);
    await screen.findByTestId("fulfill-panel");
    fireEvent.click(screen.getByRole("button", { name: "Eksiklerle Kapat" }));
    const dialog = await screen.findByRole("dialog");
    const submit = within(dialog).getByRole("button", { name: "Eksik ürünlerle kapat" }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    fireEvent.click(within(dialog).getByRole("checkbox"));
    fireEvent.change(within(dialog).getByLabelText("Açıklama"), { target: { value: "stok yok" } });
    expect(within(dialog).getByTestId("rule-hint").getAttribute("data-valid")).toBe("false");
    expect(submit.disabled).toBe(true);
    fireEvent.change(within(dialog).getByLabelText("Açıklama"), { target: { value: "Kola depoda tükenmişti" } });
    expect(within(dialog).getByTestId("rule-hint").getAttribute("data-valid")).toBe("true");
    expect(submit.disabled).toBe(false);
    fireEvent.click(submit);
    await waitFor(() =>
      expect(completeMybar).toHaveBeenCalledWith("w1", { confirmMissing: true, closeNote: "Kola depoda tükenmişti" }),
    );
  });

  it("iptal düğmesi yalnız canCancel iken çizilir; reddedilen sebep sunucu mesajıyla açık kalır", async () => {
    getMybar.mockResolvedValue(ok(twoItems()));
    const first = render(<MybarWorkbench requestId="w1" canCancel={false} />);
    await screen.findByTestId("fulfill-panel");
    expect(screen.queryByTestId("cancel-request")).toBeNull();
    first.unmount();

    cancelMybar.mockResolvedValue(fail("VALIDATION", "Geçersiz açıklama", { reason: ["Üç kelimelik sebep zorunlu"] }));
    render(<MybarWorkbench requestId="w1" canCancel />);
    await screen.findByTestId("cancel-request");
    fireEvent.click(screen.getByTestId("cancel-request"));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Misafir talebinden vazgeçti" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Talebi iptal et" }));
    await waitFor(() => expect(cancelMybar).toHaveBeenCalledWith("w1", { reason: "Misafir talebinden vazgeçti" }));
    expect(await screen.findByText("Üç kelimelik sebep zorunlu")).toBeTruthy();
    expect(screen.getByRole("dialog")).toBeTruthy();
  });
});
