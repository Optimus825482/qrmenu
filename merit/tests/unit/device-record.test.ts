import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearDevice, DEVICE_KEY, readDevice, writeDevice } from "@/shell/deviceRecord";

function installStorage(overrides: Partial<Storage> = {}): Map<string, string> {
  const data = new Map<string, string>();
  const storage = {
    getItem: (k: string) => (data.has(k) ? data.get(k)! : null),
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
    ...overrides,
  };
  vi.stubGlobal("window", { localStorage: storage, dispatchEvent: () => true });
  vi.stubGlobal("localStorage", storage);
  return data;
}

describe("deviceRecord", () => {
  beforeEach(() => void installStorage());
  afterEach(() => vi.unstubAllGlobals());

  it("kayıt yoksa null", () => {
    expect(readDevice()).toBeNull();
  });

  it("geçerli kayıt yazılır ve okunur", () => {
    expect(writeDevice({ shell: "pos", outletId: "o1", kiosk: true })).toBe(true);
    expect(readDevice()).toEqual({ shell: "pos", outletId: "o1", kiosk: true });
  });

  it("clearDevice kaydı siler", () => {
    writeDevice({ shell: "personel" });
    clearDevice();
    expect(readDevice()).toBeNull();
  });

  it.each(["{bozuk", "null", "[]", '{"shell":"xyz"}', '{"shell":"pos","kiosk":"evet"}', '{"shell":"pos","outletId":42}'])("bozuk içerik %s -> null", (raw) => {
    const data = installStorage();
    data.set(DEVICE_KEY, raw);
    expect(readDevice()).toBeNull();
  });

  it("bilinmeyen alanlar atılır", () => {
    const data = installStorage();
    data.set(DEVICE_KEY, JSON.stringify({ shell: "pos", rol: "admin" }));
    expect(readDevice()).toEqual({ shell: "pos" });
  });

  it("çok uzun outletId reddedilir", () => {
    const data = installStorage();
    data.set(DEVICE_KEY, JSON.stringify({ shell: "pos", outletId: "x".repeat(500) }));
    expect(readDevice()).toBeNull();
  });

  it("getItem fırlatırsa null (gizli pencere)", () => {
    installStorage({ getItem: () => { throw new Error("SecurityError"); } });
    expect(readDevice()).toBeNull();
  });

  it("setItem fırlatırsa writeDevice false", () => {
    installStorage({ setItem: () => { throw new Error("QuotaExceeded"); } });
    expect(writeDevice({ shell: "pos" })).toBe(false);
  });

  it("removeItem fırlatırsa clearDevice fırlatmaz", () => {
    installStorage({ removeItem: () => { throw new Error("x"); } });
    expect(() => clearDevice()).not.toThrow();
  });

  it("window yoksa (sunucu) null/false", () => {
    vi.unstubAllGlobals();
    expect(readDevice()).toBeNull();
    expect(writeDevice({ shell: "pos" })).toBe(false);
  });
});
