// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Ev = { type: string; payload?: unknown };
const sse = vi.hoisted(() => ({ handlers: [] as ((e: Ev) => void)[] }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/kasa",
  useSearchParams: () => new URLSearchParams(""),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
}));
vi.mock("@/shell/useSse", () => ({
  useSse: (cb: (e: Ev) => void) => {
    sse.handlers.push(cb);
    return { status: "open" };
  },
}));
vi.mock("@/modules/order/actions/orders", () => ({ listQueueAction: vi.fn(async () => ({ ok: true, data: [{}, {}] })) }));
vi.mock("@/modules/order/actions/calls", () => ({ listOpenCallsAction: vi.fn(async () => ({ ok: true, data: [{}] })) }));
vi.mock("@/modules/core/server/loginAction", () => ({ selectTargetAction: vi.fn() }));

import { PosShell, type PosRailItem } from "@/components/pos/PosShell";
import { resetSoundGate } from "@/components/pos/soundGate";

const RAIL: PosRailItem[] = [
  { id: "tables", label: "Masalar", icon: "table", href: "/kasa" },
  { id: "queue", label: "Kuyruk", icon: "clipboard", href: "/kasa?sekme=kuyruk" },
  { id: "calls", label: "Çağrılar", icon: "bell", href: "/kasa?sekme=cagrilar" },
];

const g = globalThis as unknown as Record<string, unknown>;

function shell() {
  return render(
    <PosShell context="kasa" outletName="Havuz Bar" hotelName="Royal" fullName="Kasa Kullanıcı" rail={RAIL} printer={{ initial: "ok", href: "/kasa/yazici" }} outletId="o1">
      <p>içerik</p>
    </PosShell>,
  );
}

beforeEach(() => {
  sse.handlers.length = 0;
  resetSoundGate();
  sessionStorage.clear();
});
afterEach(() => {
  cleanup();
  delete g.AudioContext;
  delete (document.documentElement as unknown as Record<string, unknown>).requestFullscreen;
  delete (navigator as unknown as Record<string, unknown>).wakeLock;
});

describe("PosShell", () => {
  it("ray, durum şeridi ve rozetler; ses başlangıçta 'Etkinleştirmek için dokunun'", async () => {
    shell();
    expect(screen.getByRole("navigation", { name: "Personel bölümleri" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Masalar" })).toBeTruthy();
    expect(screen.getByRole("contentinfo", { name: "Durum şeridi" })).toBeTruthy();
    expect(screen.getByText("Canlı")).toBeTruthy();
    expect(screen.getByText("Yazıcı: Hazır")).toBeTruthy();
    expect(screen.getByText("Ses: Etkinleştirmek için dokunun")).toBeTruthy();
    await waitFor(() => expect(screen.getByRole("link", { name: /Kuyruk/ }).textContent).toContain("2"));
    expect(screen.getByRole("link", { name: /Çağrılar/ }).textContent).toContain("1");
  });

  it("'Tam ekranı başlat': fullscreen + wake lock + ses tek dokunuşta", async () => {
    const request = vi.fn(async () => undefined);
    Object.defineProperty(document.documentElement, "requestFullscreen", { configurable: true, value: request });
    const wake = vi.fn(async () => ({ release: async () => undefined, addEventListener: () => undefined }));
    Object.defineProperty(navigator, "wakeLock", { configurable: true, value: { request: wake } });
    g.AudioContext = class {
      state = "suspended";
      resume = async () => undefined;
    };
    shell();
    fireEvent.click(screen.getByRole("button", { name: "Tam ekranı başlat" }));
    await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(wake).toHaveBeenCalledWith("screen"));
    await waitFor(() => expect(screen.getByText("Ses: Açık")).toBeTruthy());
    expect(screen.queryByRole("button", { name: "Tam ekranı başlat" })).toBeNull();
  });

  it("requestFullscreen reddedilir ve wakeLock yok: çökmez, şerit nedenini yazar", async () => {
    Object.defineProperty(document.documentElement, "requestFullscreen", {
      configurable: true,
      value: vi.fn(async () => {
        throw new Error("denied");
      }),
    });
    shell();
    fireEvent.click(screen.getByRole("button", { name: "Tam ekranı başlat" }));
    await waitFor(() => expect(screen.getByText("Tam ekran başlatılamadı")).toBeTruthy());
    expect(screen.getByText("Uyku kilidi desteklenmiyor")).toBeTruthy();
    expect(screen.getByText("içerik")).toBeTruthy();
  });

  it("AudioContext yoksa ses 'Desteklenmiyor'", async () => {
    shell();
    fireEvent.click(screen.getByRole("button", { name: "Ses: Etkinleştirmek için dokunun" }));
    await waitFor(() => expect(screen.getByText("Ses: Desteklenmiyor")).toBeTruthy());
  });

  it("yazıcı olayı şeride yansır", async () => {
    shell();
    act(() => sse.handlers.forEach((h) => h({ type: "printer.status", payload: { ok: false } })));
    await waitFor(() => expect(screen.getByText("Yazıcı: Hata")).toBeTruthy());
    act(() => sse.handlers.forEach((h) => h({ type: "printer.status", payload: { ok: false, reason: "SESSIZ" } })));
    await waitFor(() => expect(screen.getByText("Yazıcı: Hata (yanıt yok)")).toBeTruthy());
    act(() => sse.handlers.forEach((h) => h({ type: "print.printed" })));
    await waitFor(() => expect(screen.getByText("Yazıcı: Hazır")).toBeTruthy());
  });

  it("'Şimdi değil' kapıyı kapatır, şeritte yeniden başlatma düğmesi kalır", () => {
    shell();
    fireEvent.click(screen.getByRole("button", { name: "Şimdi değil" }));
    expect(screen.queryByRole("region", { name: "Tam ekran" })).toBeNull();
    expect(screen.getByRole("button", { name: "Tam ekranı başlat" })).toBeTruthy();
  });
});
