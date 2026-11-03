// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useShellShortcuts } from "@/shell/keyboard";
import { windowStore } from "@/shell/windowStore";
import type { WinState } from "@/shell/types";

function key(type: "keydown" | "keyup", name: string, options: KeyboardEventInit = {}, target: EventTarget = document.body) {
  const event = new KeyboardEvent(type, { key: name, cancelable: true, bubbles: true, ...options });
  act(() => {
    target.dispatchEvent(event);
  });
  return event;
}

const win = (id: string, z: number): WinState => ({
  id,
  appId: "t.none",
  title: id,
  x: 0,
  y: 0,
  w: 400,
  h: 300,
  minimized: false,
  maximized: false,
  z,
});

let menuItem: HTMLButtonElement;
let field: HTMLInputElement;

beforeEach(() => {
  document.body.innerHTML = `
    <div class="xp-window is-active"><button class="xp-menubar-item">Dosya</button></div>
    <input id="field" />`;
  menuItem = document.querySelector<HTMLButtonElement>(".xp-menubar-item")!;
  field = document.querySelector<HTMLInputElement>("#field")!;
  field.focus();
  windowStore.setState({ windows: {}, order: [], nextZ: 300 });
});

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
});

describe("useShellShortcuts", () => {
  it("F10 aktif pencerenin menü çubuğuna odaklanır ve tarayıcı varsayılanını engeller", () => {
    renderHook(() => useShellShortcuts());
    const event = key("keydown", "F10");
    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(menuItem);
  });

  it("F10 Ctrl/Shift/Alt ile birlikte işlenmez", () => {
    renderHook(() => useShellShortcuts());
    expect(key("keydown", "F10", { shiftKey: true }).defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(field);
  });

  it("tek Alt basılıp bırakılınca menü çubuğuna odaklanır", () => {
    renderHook(() => useShellShortcuts());
    key("keydown", "Alt", { altKey: true });
    key("keyup", "Alt");
    expect(document.activeElement).toBe(menuItem);
  });

  it("Alt ile başka bir tuş kullanılırsa menü çubuğuna odaklanmaz", () => {
    renderHook(() => useShellShortcuts());
    key("keydown", "Alt", { altKey: true });
    key("keydown", "d", { altKey: true });
    key("keyup", "Alt");
    expect(document.activeElement).toBe(field);
  });

  it("pencere odağını yitirince (blur) tek Alt durumu sıfırlanır", () => {
    renderHook(() => useShellShortcuts());
    key("keydown", "Alt", { altKey: true });
    act(() => {
      window.dispatchEvent(new Event("blur"));
    });
    key("keyup", "Alt");
    expect(document.activeElement).toBe(field);
  });

  it("odak bir metin alanındayken tek Alt yok sayılır", () => {
    renderHook(() => useShellShortcuts());
    key("keydown", "Alt", { altKey: true }, field);
    key("keyup", "Alt", {}, field);
    expect(document.activeElement).toBe(field);
  });

  it("Ctrl+Alt+Sağ sıradaki pencereye geçer, tek pencerede bir şey yapmaz", () => {
    renderHook(() => useShellShortcuts());
    windowStore.setState({ windows: { a: win("a", 301) }, order: ["a"], nextZ: 302 });
    expect(key("keydown", "ArrowRight", { ctrlKey: true, altKey: true }).defaultPrevented).toBe(false);

    windowStore.setState({ windows: { a: win("a", 301), b: win("b", 300) }, order: ["a", "b"], nextZ: 302 });
    const event = key("keydown", "ArrowRight", { ctrlKey: true, altKey: true });
    expect(event.defaultPrevented).toBe(true);
    const { windows } = windowStore.getState();
    expect(windows.b.z).toBeGreaterThan(windows.a.z);
  });
});
