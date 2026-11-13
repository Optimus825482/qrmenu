// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConfirmSheet } from "@/components/ui/ConfirmSheet";
import { ConfirmHost } from "@/components/ui/ConfirmHost";
import { answer, confirm, confirmStore } from "@/shell/confirm";

// ConfirmHost reads the address (a navigation answers the open question) and takes a history entry (phone's back).
const nav = vi.hoisted(() => ({ pathname: "/kat", router: { push: vi.fn(), replace: vi.fn() } }));
vi.mock("next/navigation", () => ({ usePathname: () => nav.pathname, useRouter: () => nav.router }));

afterEach(() => {
  cleanup();
  answer(false);
  confirmStore.setState({ request: null });
});

describe("ConfirmSheet", () => {
  it("tehlikeli soruda odak Vazgeç düğmesinde; Sil onaylar", async () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(<ConfirmSheet open title={'"Su" silinsin mi?'} confirmLabel="Sil" danger onConfirm={onConfirm} onCancel={onCancel} />);
    const dialog = screen.getByRole("dialog", { name: '"Su" silinsin mi?' });
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Vazgeç" }));
    fireEvent.click(screen.getByRole("button", { name: "Sil" }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
  });

  it("Esc iptal eder", () => {
    const onCancel = vi.fn();
    render(<ConfirmSheet open title="Emin misiniz?" confirmLabel="Onayla" onConfirm={() => {}} onCancel={onCancel} />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onCancel).toHaveBeenCalled();
  });

  it("düğmeler en az 56 px (var(--tap-pri))", () => {
    render(<ConfirmSheet open title="x" confirmLabel="Sil" onConfirm={() => {}} onCancel={() => {}} />);
    for (const b of screen.getAllByRole("button")) expect(b.style.minHeight).toContain("--tap-pri");
  });

  it("ConfirmHost confirm() isteğini sayfa olarak çizer", async () => {
    render(<ConfirmHost variant="sheet" />);
    const pending = confirm({ title: "Silinsin mi?", message: "Kayıt silinir.", danger: true, confirmLabel: "Sil" });
    fireEvent.click(await screen.findByRole("button", { name: "Sil" }));
    await expect(pending).resolves.toBe(true);
  });

  it("başka sayfaya geçilince açık soru olumsuz yanıtlanır (D7)", async () => {
    nav.pathname = "/kat";
    const view = render(<ConfirmHost variant="sheet" />);
    const pending = confirm({ title: "Silinsin mi?", message: "Kayıt silinir.", danger: true, confirmLabel: "Sil" });
    await screen.findByRole("button", { name: "Sil" });
    nav.pathname = "/kat/stok";
    view.rerender(<ConfirmHost variant="sheet" />);
    await expect(pending).resolves.toBe(false);
    nav.pathname = "/kat";
  });

  it("telefonun geri tuşu soruyu kapatır, sayfadan çıkmaz (D6)", async () => {
    render(<ConfirmHost variant="sheet" />);
    const pending = confirm({ title: "Silinsin mi?", message: "Kayıt silinir.", danger: true, confirmLabel: "Sil" });
    await screen.findByRole("button", { name: "Sil" });
    await waitFor(() => expect((window.history.state as { meritBack?: number } | null)?.meritBack).toBeTruthy());
    window.history.back();
    await expect(pending).resolves.toBe(false);
    expect(window.location.pathname).toBe("/");
  });

  it("basit (tehlikesiz) soru personel sayfasında kendiliğinden evet der", async () => {
    await expect(confirm({ title: "Kaydedilsin mi?", message: "x" })).resolves.toBe(true);
  });
});
