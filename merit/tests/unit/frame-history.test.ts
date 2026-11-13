import { describe, expect, it, vi } from "vitest";
import { frameCanGoBack, stepBackInFrame } from "@/shell/components/mobile/frameHistory";

const win = (pathname: string, canGoBack?: boolean) => ({
  location: { pathname } as Location,
  history: { back: vi.fn() } as unknown as History,
  ...(canGoBack === undefined ? {} : { navigation: { canGoBack } }),
});
const frameWith = (contentWindow: unknown, src = "/kat?hotelId=h1&font=tahoma&theme=luna") =>
  ({ contentWindow, getAttribute: () => src }) as unknown as HTMLIFrameElement;

describe("çerçevedeki sayfanın kendi geri adımı", () => {
  it("Navigation API varsa onun cevabı geçerlidir", () => {
    expect(frameCanGoBack(win("/kat", true), "/kat?hotelId=h1")).toBe(true);
    expect(frameCanGoBack(win("/kat/doluluk/f1", false), "/kat?hotelId=h1")).toBe(false);
  });

  it("Navigation API yoksa açıldığı adresten ayrılmış sayfanın geri adımı vardır", () => {
    expect(frameCanGoBack(win("/kat/doluluk/f1"), "/kat?hotelId=h1&font=tahoma")).toBe(true);
    expect(frameCanGoBack(win("/kat"), "/kat?hotelId=h1&font=tahoma")).toBe(false);
    expect(frameCanGoBack(win("/kat/"), "/kat")).toBe(false);
  });

  it("geri adımı olan çerçeve bir adım geri gider; ilk sayfasındaki, olmayan ya da okunamayan çerçeve gitmez", () => {
    const inside = win("/kat/doluluk/f1", true);
    expect(stepBackInFrame(frameWith(inside))).toBe(true);
    expect(inside.history.back).toHaveBeenCalledTimes(1);

    const first = win("/kat", false);
    expect(stepBackInFrame(frameWith(first))).toBe(false);
    expect(first.history.back).not.toHaveBeenCalled();

    expect(stepBackInFrame(null)).toBe(false);
    expect(stepBackInFrame(frameWith(null))).toBe(false);
    const blocked = { get contentWindow(): never { throw new Error("cross-origin"); }, getAttribute: () => "" };
    expect(stepBackInFrame(blocked as unknown as HTMLIFrameElement)).toBe(false);
  });
});
