// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { adjacentWindow, useWindowCommands } from "@/shell/keyboard";

afterEach(cleanup);

function press(key: string, options: KeyboardEventInit = {}) {
  const event = new KeyboardEvent("keydown", { key, cancelable: true, bubbles: true, ...options });
  act(() => document.body.dispatchEvent(event));
  return event;
}

describe("useWindowCommands", () => {
  it("uses the registered save action for Ctrl+S", () => {
    const save = vi.fn();
    renderHook(() => useWindowCommands({ save }));
    expect(press("s", { ctrlKey: true }).defaultPrevented).toBe(true);
    expect(save).toHaveBeenCalledOnce();
  });

  it("leaves Ctrl+S alone when no save action is registered", () => {
    renderHook(() => useWindowCommands({}));
    expect(press("s", { ctrlKey: true }).defaultPrevented).toBe(false);
  });

  it("uses F1 for contextual help", () => {
    const help = vi.fn();
    renderHook(() => useWindowCommands({ help }));
    expect(press("F1").defaultPrevented).toBe(true);
    expect(help).toHaveBeenCalledOnce();
  });
});

describe("adjacentWindow (Ctrl+Alt+Sol/Sağ)", () => {
  it("sona ulaşınca başa sarar ve tek pencerede geçiş yapmaz", () => {
    expect(adjacentWindow(["a", "b", "c"], "b", 1)).toBe("c");
    expect(adjacentWindow(["a", "b", "c"], "c", 1)).toBe("a");
    expect(adjacentWindow(["a", "b", "c"], "a", -1)).toBe("c");
    expect(adjacentWindow(["a"], "a", 1)).toBeUndefined();
    expect(adjacentWindow([], undefined, 1)).toBeUndefined();
  });

  it("etkin pencere yoksa yöne göre ilk ya da son pencereyi seçer", () => {
    expect(adjacentWindow(["a", "b"], undefined, 1)).toBe("a");
    expect(adjacentWindow(["a", "b"], undefined, -1)).toBe("b");
  });
});
