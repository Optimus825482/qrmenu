import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { answer, confirmStore } from "@/shell/confirm";
import { notify, notifyStore, pauseToast, resumeToast, setNotifySurface } from "@/shell/notify";

beforeEach(() => {
  vi.useFakeTimers();
  answer(false);
  confirmStore.setState({ request: null });
  notify.clear();
  setNotifySurface("snackbar");
});

afterEach(() => {
  notify.clear();
  setNotifySurface("xp");
  vi.useRealTimers();
});

const toasts = () => notifyStore.getState().toasts;

describe("notify.success", () => {
  it("varsayılan 4000 ms; süre dolunca temizlenir ve zamanlayıcı kalmaz", () => {
    notify.success("Kaydedildi");
    expect(toasts()[0]).toMatchObject({ kind: "success", message: "Kaydedildi", durationMs: 4000 });
    vi.advanceTimersByTime(3999);
    expect(toasts()).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(toasts()).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("undo ile 6000 ms ve Geri al etiketi; ikinci çağrıda undo tek sefer çalışır", async () => {
    const undo = vi.fn();
    const id = notify.success("Silindi", { undo });
    const t = toasts().find((x) => x.id === id)!;
    expect(t).toMatchObject({ durationMs: 6000, actionLabel: "Geri al" });
    await Promise.all([t.onAction!(), t.onAction!()]);
    await t.onAction!();
    expect(undo).toHaveBeenCalledTimes(1);
    expect(toasts().find((x) => x.id === id)).toBeUndefined();
  });

  it("geri alma reddederse Geri alınamadı hata bildirimi eklenir", async () => {
    const id = notify.success("Silindi", { undo: () => Promise.reject(new Error("süre geçti")) });
    await toasts().find((x) => x.id === id)!.onAction!();
    expect(toasts()[0]).toMatchObject({ kind: "error", durationMs: null });
    expect(toasts()[0].message).toContain("Geri alınamadı");
  });

  it("en çok 3 görünür, yeni olan üstte; düşen bildirimin zamanlayıcısı kalmaz", () => {
    notify.success("bir");
    notify.success("iki");
    notify.success("üç");
    notify.success("dört");
    expect(toasts().map((t) => t.message)).toEqual(["dört", "üç", "iki"]);
    expect(vi.getTimerCount()).toBe(3);
    vi.advanceTimersByTime(4000);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("üzerine gelince duraklar, ayrılınca kalan süreyle devam eder", () => {
    const id = notify.success("Kaydedildi");
    vi.advanceTimersByTime(2000);
    pauseToast(id);
    vi.advanceTimersByTime(10_000);
    expect(toasts()).toHaveLength(1);
    resumeToast(id);
    vi.advanceTimersByTime(2000);
    expect(toasts()).toHaveLength(0);
  });

  it("XP yüzeyinde durum metnini besler ve 4 sn sonra siler", () => {
    setNotifySurface("xp");
    notify.success("Outlet kaydedildi");
    expect(notifyStore.getState().statusText).toBe("Outlet kaydedildi");
    vi.advanceTimersByTime(4000);
    expect(notifyStore.getState().statusText).toBe("");
  });
});

describe("notify.error", () => {
  it("snackbar: kalıcı (durationMs null); Tekrar dene yalnız retry varsa", () => {
    notify.error("Silinemedi");
    expect(toasts()[0]).toMatchObject({ kind: "error", durationMs: null });
    expect(toasts()[0].actionLabel).toBeUndefined();
    notify.error("Silinemedi", { retry: () => {} });
    expect(toasts()[0].actionLabel).toBe("Tekrar dene");
    vi.advanceTimersByTime(60_000);
    expect(toasts()).toHaveLength(2);
  });

  it("xp: alertDialog isteği açar, toast eklemez", () => {
    setNotifySurface("xp");
    notify.error("Kat silinemedi", { title: "Silinemedi" });
    expect(confirmStore.getState().request).toMatchObject({ kind: "alert", title: "Silinemedi", message: "Kat silinemedi" });
    expect(toasts()).toHaveLength(0);
    answer(true);
    notify.error("Bir şey oldu");
    expect(confirmStore.getState().request?.title).toBe("İşlem tamamlanamadı");
    answer(true);
  });
});

describe("notify.dismiss / info", () => {
  it("dismiss bildirimi ve zamanlayıcısını kaldırır; info 4 sn", () => {
    const id = notify.info("Bilgi");
    expect(toasts()[0]).toMatchObject({ kind: "info", durationMs: 4000 });
    notify.dismiss(id);
    expect(toasts()).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);
  });
});
