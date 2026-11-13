// @vitest-environment jsdom
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { dropBackEntry, isTopBackEntry, pushBackEntry, resetBackStack } from "@/shell/backStack";

const answers: boolean[] = [];
const asked = vi.fn();
vi.mock("@/shell/confirm", () => ({
  confirm: vi.fn(async (opts: unknown) => {
    asked(opts);
    return answers.shift() ?? false;
  }),
}));
const router = { push: vi.fn(), replace: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const { useBackCloses } = await import("@/shell/useBackCloses");
const { useLeaveGuard } = await import("@/shell/useLeaveGuard");

const meritEntry = () => (window.history.state as { meritBack?: number } | null)?.meritBack;
/** The browser's back: the popstate the phone's button (or the shell) would give. */
async function pressBack() {
  await act(async () => {
    window.history.back();
    await new Promise((r) => setTimeout(r, 30));
  });
}

beforeEach(() => {
  resetBackStack();
  answers.length = 0;
  asked.mockClear();
  router.push.mockClear();
  router.replace.mockClear();
});
afterEach(() => cleanup());

describe("backStack", () => {
  it("geri tuşu en üstteki sahibini bir kez çağırır", async () => {
    const onBack = vi.fn();
    pushBackEntry(onBack);
    await waitFor(() => expect(meritEntry()).toBeTruthy());
    await pressBack();
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("kendiliğinden kapanan giriş geri adımıyla kaldırılır, sahibi çağrılmaz", async () => {
    const onBack = vi.fn();
    const id = pushBackEntry(onBack);
    expect(isTopBackEntry(id)).toBe(true);
    await waitFor(() => expect(meritEntry()).toBe(id));
    await act(() => dropBackEntry(id));
    expect(onBack).not.toHaveBeenCalled();
    expect(meritEntry()).not.toBe(id);
  });
});

function Dialog({ open, onClose }: { open: boolean; onClose: () => boolean | void | Promise<boolean | void> }) {
  useBackCloses(open, onClose);
  return null;
}

describe("useBackCloses (D6)", () => {
  it("geri tuşu pencereyi kapatır", async () => {
    const onClose = vi.fn();
    render(<Dialog open onClose={onClose} />);
    await waitFor(() => expect(meritEntry()).toBeTruthy());
    await pressBack();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("kapanmayı reddeden pencere (kaydedilmemiş girdi) girişini geri koyar", async () => {
    const onClose = vi.fn(() => false);
    render(<Dialog open onClose={onClose} />);
    await waitFor(() => expect(meritEntry()).toBeTruthy());
    const first = meritEntry();
    await pressBack();
    expect(onClose).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(meritEntry()).toBeGreaterThan(first!));
    await pressBack();
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});

type Guard = ReturnType<typeof useLeaveGuard>;
let guard: Guard | null = null;
const keepGuard = (g: Guard) => {
  guard = g;
};
function Form({ dirty, onGuard = keepGuard }: { dirty: boolean; onGuard?: (g: Guard) => void }) {
  const g = useLeaveGuard(dirty);
  useEffect(() => onGuard(g));
  return null;
}

describe("useLeaveGuard (D4)", () => {
  it("temiz sayfa sormadan bırakılır", async () => {
    render(<Form dirty={false} />);
    await expect(guard!.leave()).resolves.toBe(true);
    expect(asked).not.toHaveBeenCalled();
  });

  it("kaydedilmemiş girdi: Geri önce sorar; Vazgeç sayfada tutar", async () => {
    render(<Form dirty />);
    answers.push(false);
    await expect(guard!.leave()).resolves.toBe(false);
    expect(asked).toHaveBeenCalledTimes(1);
    expect(asked.mock.calls[0][0]).toMatchObject({ danger: true, confirmLabel: "Çık", cancelLabel: "Vazgeç" });
    answers.push(true);
    await expect(guard!.leave()).resolves.toBe(true);
  });

  it("telefonun geri tuşu da sorar; Vazgeç tuzağı geri kurar, Çık geri gider", async () => {
    const back = vi.spyOn(window.history, "back");
    render(<Form dirty />);
    await waitFor(() => expect(meritEntry()).toBeTruthy());
    answers.push(false);
    await pressBack();
    expect(asked).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(meritEntry()).toBeTruthy());
    back.mockClear();
    answers.push(true);
    await pressBack();
    expect(asked).toHaveBeenCalledTimes(2);
    // "Çık": the page itself is left with one more step back.
    await waitFor(() => expect(back).toHaveBeenCalledTimes(2));
    back.mockRestore();
  });

  it("kayıttan sonra release() soru sormadan girişi kaldırır", async () => {
    render(<Form dirty />);
    await waitFor(() => expect(meritEntry()).toBeTruthy());
    await act(() => guard!.release());
    await expect(guard!.leave()).resolves.toBe(true);
    expect(asked).not.toHaveBeenCalled();
  });
});
