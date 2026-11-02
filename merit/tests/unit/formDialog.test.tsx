// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Result } from "@/lib/result";
import { answer, confirmStore } from "@/shell/confirm";
import { notify, notifyStore } from "@/shell/notify";
import { Field } from "@/shell/ui/Field";
import { FormDialog } from "@/shell/ui/FormDialog";
import { Toolbar } from "@/shell/ui/Toolbar";

afterEach(() => {
  cleanup();
  answer(false);
  confirmStore.setState({ request: null });
});

/** A successful save shows no modal: a non-blocking success notice (notify) is queued instead. */
async function acknowledgeSuccess() {
  await waitFor(() => expect(notifyStore.getState().toasts[0]).toMatchObject({ kind: "success" }));
  expect(confirmStore.getState().request).toBeNull();
}

type Submit = (v: Record<string, string>) => Promise<Result<unknown>>;

function setup(onSubmit: Submit, onClose = vi.fn()) {
  render(
    <FormDialog title="Yeni Kat" open onClose={onClose} onSubmit={onSubmit} submitText="Kaydet">
      <Field name="name" label="Ad">
        <input defaultValue="" />
      </Field>
      <Field name="no" label="Numara">
        <input defaultValue="" />
      </Field>
    </FormDialog>,
  );
  return { onClose };
}

describe("FormDialog", () => {
  it("kapalıyken hiçbir şey render etmez", () => {
    render(
      <FormDialog title="x" open={false} onClose={vi.fn()} onSubmit={vi.fn()} submitText="Tamam">
        <span>içerik</span>
      </FormDialog>,
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("role=dialog, başlıkla etiketli; ilk alana odaklanır; etiketler alana bağlıdır", () => {
    setup(async () => ({ ok: true, data: null }));
    const dialog = screen.getByRole("dialog", { name: "Yeni Kat" });
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(document.activeElement).toBe(screen.getByLabelText("Ad"));
  });

  it("gönderince alan değerlerini name'e göre toplar ve başarıda kapanır", async () => {
    const onSubmit = vi.fn<Submit>(async () => ({ ok: true, data: null }));
    const { onClose } = setup(onSubmit);
    fireEvent.change(screen.getByLabelText("Ad"), { target: { value: "Zemin" } });
    fireEvent.change(screen.getByLabelText("Numara"), { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: "Kaydet" }));
    await acknowledgeSuccess();
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(onSubmit).toHaveBeenCalledWith({ name: "Zemin", no: "0" });
  });

  it("hata Result'ı: banner role=alert, fieldErrors alan altında; pencere açık kalır", async () => {
    const { onClose } = setup(async () => ({
      ok: false,
      error: {
        code: "VALIDATION",
        message: "Girilen bilgiler geçersiz",
        fieldErrors: { name: ["Ad zorunlu"] },
      },
    }));
    fireEvent.click(screen.getByRole("button", { name: "Kaydet" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Girilen bilgiler geçersiz");
    expect(screen.getByText("Ad zorunlu")).toBeTruthy();
    expect(screen.getByLabelText("Ad").getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByLabelText("Numara").getAttribute("aria-invalid")).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("gönderim sürerken Kaydet aria-busy olur ve ikinci gönderim engellenir", async () => {
    let finish!: (r: Result<unknown>) => void;
    const onSubmit = vi.fn<Submit>(() => new Promise<Result<unknown>>((r) => (finish = r)));
    setup(onSubmit);
    const button = screen.getByRole("button", { name: "Kaydet" });
    fireEvent.click(button);
    await waitFor(() => expect(button.getAttribute("aria-busy")).toBe("true"));
    fireEvent.click(button);
    expect(onSubmit).toHaveBeenCalledTimes(1);
    finish({ ok: true, data: null });
    await acknowledgeSuccess();
    await waitFor(() => expect(button.getAttribute("aria-busy")).toBeNull());
  });

  it("onSubmit fırlatırsa genel hata bannerı gösterilir", async () => {
    setup(async () => {
      throw new Error("ağ");
    });
    fireEvent.click(screen.getByRole("button", { name: "Kaydet" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Beklenmeyen");
  });

  it("Esc ve Vazgeç kapatır", () => {
    const { onClose } = setup(async () => ({ ok: true, data: null }));
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Vazgeç" }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("Tab odağı pencere içinde tutar (sondan ilke, Shift+Tab ile baştan sona)", () => {
    setup(async () => ({ ok: true, data: null }));
    const dialog = screen.getByRole("dialog");
    const first = screen.getByLabelText("Ad");
    const last = screen.getByRole("button", { name: "Vazgeç" });
    last.focus();
    fireEvent.keyDown(dialog, { key: "Tab" });
    expect(document.activeElement).toBe(first);
    first.focus();
    fireEvent.keyDown(dialog, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(last);
  });
});

describe("Toolbar", () => {
  it("verilen işleyicilere göre aria-label'lı düğmeleri gösterir ve çağırır", () => {
    const onNew = vi.fn();
    const onDelete = vi.fn();
    render(<Toolbar onNew={onNew} onDelete={onDelete} deleteDisabled />);
    fireEvent.click(screen.getByRole("button", { name: "Yeni kayıt" }));
    expect(onNew).toHaveBeenCalled();
    const del = screen.getByRole("button", { name: "Seçili kaydı sil" }) as HTMLButtonElement;
    expect(del.disabled).toBe(true);
    expect(screen.queryByRole("button", { name: "Seçili kaydı düzenle" })).toBeNull();
    expect(screen.getByRole("toolbar")).toBeTruthy();
  });
});
