// @vitest-environment jsdom
import { act, cleanup, render, renderHook, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const actions = vi.hoisted(() => ({
  getPushPublicKeyAction: vi.fn(),
  subscribePushAction: vi.fn(),
  unsubscribePushAction: vi.fn(),
}));
vi.mock("@/modules/core/server/pushActions", () => actions);

import { PushBanner } from "@/shell/push/PushBanner";
import { PushToggle } from "@/shell/push/PushToggle";
import { urlBase64ToUint8Array, usePushSubscription } from "@/shell/push/usePushSubscription";

const KEY = "BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U";

type Fake = { sub: { endpoint: string; toJSON: () => unknown; unsubscribe: ReturnType<typeof vi.fn> } | null };

function setup(opts: { permission?: NotificationPermission; request?: NotificationPermission; supported?: boolean; sub?: boolean }) {
  const fake: Fake = { sub: null };
  const makeSub = () => ({
    endpoint: "https://fcm.googleapis.com/fcm/send/x",
    toJSON: () => ({ keys: { p256dh: "P", auth: "A" } }),
    unsubscribe: vi.fn(async () => true),
  });
  if (opts.sub) fake.sub = makeSub();
  const subscribe = vi.fn(async () => (fake.sub = makeSub()));
  const reg = { pushManager: { getSubscription: vi.fn(async () => fake.sub), subscribe } };
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: { getRegistration: vi.fn(async () => reg), register: vi.fn(async () => reg), ready: Promise.resolve(reg) },
  });
  const requestPermission = vi.fn(async () => opts.request ?? "granted");
  const N = Object.assign(function () {}, { permission: opts.permission ?? "default", requestPermission });
  vi.stubGlobal("Notification", N);
  if (opts.supported === false) {
    // PushManager yok
    delete (window as unknown as Record<string, unknown>).PushManager;
  } else {
    (window as unknown as Record<string, unknown>).PushManager = function () {};
  }
  return { fake, subscribe, requestPermission };
}

beforeEach(() => {
  actions.getPushPublicKeyAction.mockResolvedValue({ ok: true, data: { key: KEY } });
  actions.subscribePushAction.mockResolvedValue({ ok: true, data: { id: "1" } });
  actions.unsubscribePushAction.mockResolvedValue({ ok: true, data: { removed: true } });
  window.localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

const statusOf = async (r: ReturnType<typeof renderHook<ReturnType<typeof usePushSubscription>, unknown>>) => {
  await waitFor(() => expect(r.result.current.status).not.toBeNull());
  return r.result.current.status;
};

describe("usePushSubscription", () => {
  it("PushManager yok: unsupported", async () => {
    setup({ supported: false });
    expect(await statusOf(renderHook(() => usePushSubscription()))).toBe("unsupported");
  });

  it("anahtar null: unavailable ve PushToggle boş", async () => {
    setup({});
    actions.getPushPublicKeyAction.mockResolvedValue({ ok: true, data: { key: null } });
    expect(await statusOf(renderHook(() => usePushSubscription()))).toBe("unavailable");
    const { container } = render(<PushToggle />);
    await waitFor(() => expect(actions.getPushPublicKeyAction).toHaveBeenCalledTimes(2));
    expect(container.innerHTML).toBe("");
  });

  it("izin denied: denied", async () => {
    setup({ permission: "denied" });
    expect(await statusOf(renderHook(() => usePushSubscription()))).toBe("denied");
  });

  it("prompt iken enable: requestPermission, subscribe, subscribePushAction", async () => {
    const { subscribe, requestPermission } = setup({});
    const r = renderHook(() => usePushSubscription());
    expect(await statusOf(r)).toBe("prompt");
    await act(() => r.result.current.enable());
    expect(requestPermission).toHaveBeenCalled();
    const arg = (subscribe.mock.calls[0] as unknown as [{ userVisibleOnly: boolean; applicationServerKey: Uint8Array }])[0];
    expect(arg.userVisibleOnly).toBe(true);
    expect(arg.applicationServerKey).toEqual(urlBase64ToUint8Array(KEY));
    expect(arg.applicationServerKey).toHaveLength(65);
    expect(actions.subscribePushAction).toHaveBeenCalledWith(
      expect.objectContaining({ endpoint: "https://fcm.googleapis.com/fcm/send/x", keys: { p256dh: "P", auth: "A" } }),
    );
    expect(r.result.current.status).toBe("subscribed");
  });

  it("izin reddedilirse eylem çağrılmaz ve denied olur", async () => {
    setup({ request: "denied" });
    const r = renderHook(() => usePushSubscription());
    await statusOf(r);
    await act(() => r.result.current.enable());
    expect(actions.subscribePushAction).not.toHaveBeenCalled();
    expect(r.result.current.status).toBe("denied");
  });

  it("disable: unsubscribe + unsubscribePushAction", async () => {
    const { fake } = setup({ permission: "granted", sub: true });
    const r = renderHook(() => usePushSubscription());
    expect(await statusOf(r)).toBe("subscribed");
    const sub = fake.sub!;
    await act(() => r.result.current.disable());
    expect(sub.unsubscribe).toHaveBeenCalled();
    expect(actions.unsubscribePushAction).toHaveBeenCalledWith("https://fcm.googleapis.com/fcm/send/x");
    expect(r.result.current.status).toBe("idle");
  });
});

describe("PushBanner", () => {
  it("yalnız prompt iken görünür; Daha sonra sonrası görünmez", async () => {
    setup({});
    const { rerender } = render(<PushBanner />);
    const later = await screen.findByText("Daha sonra");
    act(() => later.click());
    expect(screen.queryByTestId("push-banner")).toBeNull();
    cleanup();
    render(<PushBanner />);
    await waitFor(() => expect(actions.getPushPublicKeyAction).toHaveBeenCalledTimes(2));
    expect(screen.queryByTestId("push-banner")).toBeNull();
    void rerender;
  });

  it("izin verilmişse görünmez", async () => {
    setup({ permission: "granted" });
    render(<PushBanner />);
    await waitFor(() => expect(actions.getPushPublicKeyAction).toHaveBeenCalled());
    expect(screen.queryByTestId("push-banner")).toBeNull();
  });
});

describe("unsubscribePushOnLogout", () => {
  it("aboneliği kaldırır ve sunucuya bildirir", async () => {
    const { fake } = setup({ permission: "granted", sub: true });
    const { unsubscribePushOnLogout } = await import("@/shell/push/unsubscribeOnLogout");
    const sub = fake.sub!;
    await unsubscribePushOnLogout();
    expect(sub.unsubscribe).toHaveBeenCalled();
    expect(actions.unsubscribePushAction).toHaveBeenCalledWith("https://fcm.googleapis.com/fcm/send/x");
  });

  it("takılırsa en çok ~1 sn bekler ve fırlatmaz", async () => {
    setup({ permission: "granted", sub: true });
    actions.unsubscribePushAction.mockReturnValue(new Promise(() => {}));
    const { unsubscribePushOnLogout } = await import("@/shell/push/unsubscribeOnLogout");
    const t0 = Date.now();
    await expect(unsubscribePushOnLogout()).resolves.toBeUndefined();
    expect(Date.now() - t0).toBeLessThan(1600);
  });

  it("service worker yoksa sessizce biter", async () => {
    Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: undefined });
    delete (navigator as unknown as Record<string, unknown>).serviceWorker;
    const { unsubscribePushOnLogout } = await import("@/shell/push/unsubscribeOnLogout");
    await expect(unsubscribePushOnLogout()).resolves.toBeUndefined();
  });
});
