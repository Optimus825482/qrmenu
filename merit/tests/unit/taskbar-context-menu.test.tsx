// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Right click (long press on a tablet) on a task button opens the window's own menu: restore, minimize, close.
// Close goes through the window's own close request, so unsaved changes still ask first.

vi.mock("@/shell/useSse", () => ({ useSse: () => ({ status: "open" }) }));
vi.mock("@/shell/icons", () => ({ XpIcon: () => null }));
vi.mock("@/shell/components/NotificationBell", () => ({ NotificationBell: () => null }));
vi.mock("@/shell/components/TrayBalloon", () => ({ TrayStatusText: () => null }));
vi.mock("@/shell/components/TrayStatus", () => ({ DbTray: () => null, PrinterTray: () => null }));
vi.mock("@/components/EnvLabel", () => ({ EnvLabel: () => null }));

import { Taskbar } from "@/shell/components/Taskbar";
import type { WinState } from "@/shell/types";
import { registerCloseRequest } from "@/shell/windowCloseRequests";
import { windowStore } from "@/shell/windowStore";

const win = (id: string, title: string, z: number, minimized = false): WinState => ({
  id,
  appId: "t.none",
  title,
  x: 0,
  y: 0,
  w: 400,
  h: 300,
  minimized,
  maximized: false,
  z,
});

function open(...wins: WinState[]) {
  windowStore.setState({
    windows: Object.fromEntries(wins.map((w) => [w.id, w])),
    order: wins.map((w) => w.id),
    nextZ: 400,
  });
  render(<Taskbar startOpen={false} onToggleStart={() => {}} startButtonRef={createRef<HTMLButtonElement>()} />);
}
const task = (title: string) => screen.getByRole("button", { name: title });
const item = (label: string) => screen.getByRole("menuitem", { name: label });
const state = () => windowStore.getState();

beforeEach(() => {
  windowStore.setState({ windows: {}, order: [], nextZ: 300 });
});
afterEach(cleanup);

describe("Taskbar: right click on a task button", () => {
  it("opens a menu named after the window, without toggling the window", () => {
    open(win("a", "Outlet Operasyonları", 301), win("b", "Oda Servisi Menü Tasarımı", 302));
    const event = fireEvent.contextMenu(task("Outlet Operasyonları"));
    // The browser's own menu is suppressed.
    expect(event).toBe(false);
    expect(screen.getByRole("menu", { name: "Outlet Operasyonları" })).toBeDefined();
    expect(item("Simge Durumuna Küçült")).toBeDefined();
    expect(item("Kapat")).toBeDefined();
    expect(state().windows.a.minimized).toBe(false);
    expect(state().windows.a.z).toBe(301);
  });

  it("minimizes the window it was opened on, active or not", () => {
    open(win("a", "Outlet Operasyonları", 301), win("b", "Oda Servisi Menü Tasarımı", 302));
    fireEvent.contextMenu(task("Outlet Operasyonları"));
    fireEvent.click(item("Simge Durumuna Küçült"));
    expect(state().windows.a.minimized).toBe(true);
    expect(state().windows.b.minimized).toBe(false);
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("closes the window it was opened on and leaves the others", () => {
    open(win("a", "Outlet Operasyonları", 301), win("b", "Oda Servisi Menü Tasarımı", 302));
    fireEvent.contextMenu(task("Oda Servisi Menü Tasarımı"));
    fireEvent.click(item("Kapat"));
    expect(state().windows.b).toBeUndefined();
    expect(state().order).toEqual(["a"]);
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("hands Kapat to the window's own close request, which may keep the window open (unsaved changes)", () => {
    open(win("a", "Outlet Operasyonları", 301));
    const ask = vi.fn();
    const unregister = registerCloseRequest("a", ask);
    fireEvent.contextMenu(task("Outlet Operasyonları"));
    fireEvent.click(item("Kapat"));
    expect(ask).toHaveBeenCalledTimes(1);
    expect(state().windows.a).toBeDefined();
    unregister();
  });

  it("offers restore instead of minimize on a minimized window", () => {
    open(win("a", "Outlet Operasyonları", 301, true));
    fireEvent.contextMenu(task("Outlet Operasyonları"));
    expect(item("Simge Durumuna Küçült").getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(item("Geri Yükle"));
    expect(state().windows.a.minimized).toBe(false);
  });

  it("drops the menu when its window is closed from elsewhere", () => {
    open(win("a", "Outlet Operasyonları", 301));
    fireEvent.contextMenu(task("Outlet Operasyonları"));
    act(() => state().close("a"));
    expect(screen.queryByRole("menu")).toBeNull();
  });
});
