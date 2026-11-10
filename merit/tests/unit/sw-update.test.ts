import { describe, expect, it, vi } from "vitest";
import { watchServiceWorkerUpdate } from "@/shell/swUpdate";

function fakeContainer(controller: unknown) {
  const listeners = new Set<() => void>();
  return {
    controller: controller as ServiceWorker | null,
    addEventListener: (_t: string, l: () => void) => void listeners.add(l),
    removeEventListener: (_t: string, l: () => void) => void listeners.delete(l),
    fire: () => listeners.forEach((l) => l()),
    size: () => listeners.size,
  };
}

describe("service worker güncelleme bildirimi", () => {
  it("ilk kurulumda bildirmez", () => {
    const c = fakeContainer(null);
    const on = vi.fn();
    watchServiceWorkerUpdate(c as never, on);
    c.fire();
    expect(on).not.toHaveBeenCalled();
  });
  it("denetlenen sayfada yeni sürümü bir kez bildirir", () => {
    const c = fakeContainer({});
    const on = vi.fn();
    watchServiceWorkerUpdate(c as never, on);
    c.fire();
    c.fire();
    expect(on).toHaveBeenCalledTimes(1);
  });
  it("temizleme dinleyiciyi kaldırır", () => {
    const c = fakeContainer({});
    const stop = watchServiceWorkerUpdate(c as never, vi.fn());
    stop();
    expect(c.size()).toBe(0);
  });
});
