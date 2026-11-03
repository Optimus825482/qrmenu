// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReasonDialog } from "@/components/ui/ReasonDialog";
import { ConfirmHost } from "@/components/ui/ConfirmHost";
import { askReason, answerReason, reasonStore } from "@/components/ui/reason";

afterEach(() => {
  cleanup();
  answerReason(null);
  reasonStore.setState({ request: null });
});

function setup(over: Partial<React.ComponentProps<typeof ReasonDialog>> = {}) {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  render(
    <ReasonDialog
      open
      title="Sipariş #12 reddedilecek"
      reasons={["Ürün tükendi / stok yok", "Hatalı sipariş"]}
      minLength={3}
      confirmLabel="Reddet"
      onConfirm={onConfirm}
      onCancel={onCancel}
      {...over}
    />,
  );
  return { onConfirm, onCancel };
}

describe("ReasonDialog", () => {
  it("modal dialog; Diğer sebep alanı odakta; 2 karakter onayı pasif, 3 karakter etkin", () => {
    setup();
    const dialog = screen.getByRole("dialog", { name: "Sipariş #12 reddedilecek" });
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    const field = screen.getByLabelText("Diğer sebep");
    expect(document.activeElement).toBe(field);
    const ok = screen.getByRole("button", { name: "Reddet" }) as HTMLButtonElement;
    fireEvent.change(field, { target: { value: "ab" } });
    expect(ok.disabled).toBe(true);
    expect(screen.getByText("2/3")).toBeTruthy();
    fireEvent.change(field, { target: { value: "abc" } });
    expect(ok.disabled).toBe(false);
  });

  it("boşluklar sayılmaz", () => {
    setup();
    fireEvent.change(screen.getByLabelText("Diğer sebep"), { target: { value: "  a  " } });
    expect((screen.getByRole("button", { name: "Reddet" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("hazır sebep tek dokunuşla alanı doldurur ve onaylanabilir", async () => {
    const { onConfirm } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Hatalı sipariş" }));
    expect((screen.getByLabelText("Diğer sebep") as HTMLTextAreaElement).value).toBe("Hatalı sipariş");
    fireEvent.click(screen.getByRole("button", { name: "Reddet" }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith("Hatalı sipariş"));
  });

  it("Esc iptal eder", () => {
    const { onCancel } = setup();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("sunucu bağlantısı kesilirse açıklamayı saklar ve tekrar denemeyi sağlar", async () => {
    setup({ onConfirm: vi.fn().mockRejectedValue(new Error("network")) });
    fireEvent.click(screen.getByRole("button", { name: "Hatalı sipariş" }));
    const button = screen.getByRole<HTMLButtonElement>("button", { name: "Reddet" });
    fireEvent.click(button);
    expect((await screen.findByRole("alert")).textContent).toContain("İşlem tamamlanamadı");
    expect(button.disabled).toBe(false);
    expect(screen.getByLabelText<HTMLTextAreaElement>("Diğer sebep").value).toBe("Hatalı sipariş");
  });

  it("Tab odağı diyalog içinde döndürür", () => {
    setup();
    const cancel = screen.getByRole("button", { name: "Vazgeç" });
    cancel.focus();
    fireEvent.keyDown(window, { key: "Tab" });
    expect(screen.getByRole("dialog").contains(document.activeElement)).toBe(true);
  });

  it("kapalıyken hiçbir şey çizmez", () => {
    setup({ open: false });
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("askReason + ConfirmHost", () => {
  it("sebep ile çözülür; iptal null döner", async () => {
    render(<ConfirmHost variant="sheet" />);
    const first = askReason({ title: "Reddet", reasons: ["Hatalı sipariş"], minLength: 3, confirmLabel: "Reddet" });
    fireEvent.click(await screen.findByRole("button", { name: "Hatalı sipariş" }));
    fireEvent.click(screen.getByRole("button", { name: "Reddet" }));
    await expect(first).resolves.toBe("Hatalı sipariş");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    const second = askReason({ title: "Reddet", reasons: [], minLength: 3, confirmLabel: "Reddet" });
    fireEvent.click(await screen.findByRole("button", { name: "Vazgeç" }));
    await expect(second).resolves.toBeNull();
  });
});
