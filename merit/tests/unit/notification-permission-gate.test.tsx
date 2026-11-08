// @vitest-environment jsdom
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const actions = vi.hoisted(() => ({
  getPushPublicKeyAction: vi.fn(),
  subscribePushAction: vi.fn(),
  unsubscribePushAction: vi.fn(),
}));
vi.mock("@/modules/core/server/pushActions", () => actions);

import { NotificationPermissionGate } from "@/components/ops/NotificationPermissionGate";

describe("NotificationPermissionGate", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  beforeEach(() => {
    actions.getPushPublicKeyAction.mockResolvedValue({ ok: true, data: { key: "test-key" } });
  });

  it("renders nothing when permission is granted", () => {
    vi.stubGlobal("Notification", {
      permission: "granted",
      requestPermission: vi.fn(),
    });

    const { container } = render(<NotificationPermissionGate screen="Garson" />);
    expect(container.firstChild).toBeNull();
  });

  it("renders prompt banner when permission is default", () => {
    const requestPermission = vi.fn().mockResolvedValue("default");
    vi.stubGlobal("Notification", {
      permission: "default",
      requestPermission,
    });

    render(<NotificationPermissionGate screen="Garson" />);
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.getByText(/Garson Ekranı · Bildirim İzni Gerekli/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Bildirimlere İzin Ver/i })).toBeTruthy();
  });

  it("renders warning banner when permission is denied", () => {
    vi.stubGlobal("Notification", {
      permission: "denied",
      requestPermission: vi.fn(),
    });

    render(<NotificationPermissionGate screen="Şef / Mutfak" />);
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.getByText(/Şef \/ Mutfak Ekranı · Bildirim İzni Gerekli/)).toBeTruthy();
    expect(screen.getByText(/Engellendi/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /İzni Tekrar Kontrol Et/i })).toBeTruthy();
  });

  it("calls requestPermission when clicking 'Bildirimlere İzin Ver'", async () => {
    const requestPermission = vi.fn().mockResolvedValue("granted");
    vi.stubGlobal("Notification", {
      permission: "default",
      requestPermission,
    });

    render(<NotificationPermissionGate screen="Garson" />);
    const btn = screen.getByRole("button", { name: /Bildirimlere İzin Ver/i });
    fireEvent.click(btn);

    await waitFor(() => {
      expect(requestPermission).toHaveBeenCalled();
    });
  });
});
