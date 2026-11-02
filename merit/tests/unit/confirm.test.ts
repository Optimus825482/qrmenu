import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "@/lib/settings-defs";
import { alertDialog, answer, confirm, confirmRemoveShortcut, confirmStore } from "@/shell/confirm";

beforeEach(() => {
  answer(false);
  confirmStore.setState({ request: null, confirmSimpleActions: true });
});

describe("confirm() — tek onay", () => {
  it("confirmSimpleActions başlangıç değeri false: danger:false sorulmadan true döner", async () => {
    expect(DEFAULT_SETTINGS["shell.confirmSimpleActions"]).toBe(false);
    confirmStore.setState({ confirmSimpleActions: false });
    await expect(confirm({ title: "Basit", message: "?", danger: false })).resolves.toBe(true);
    expect(confirmStore.getState().request).toBeNull();
  });

  it("danger:true + confirmLabel soru sorar; cancelLabel Vazgeç, odak iptalde", async () => {
    confirmStore.setState({ confirmSimpleActions: false });
    const pending = confirm({ title: "Sil", message: "?", danger: true, confirmLabel: "Sil" });
    expect(confirmStore.getState().request).toMatchObject({
      confirmLabel: "Sil",
      cancelLabel: "Vazgeç",
      autoFocusTarget: "cancel",
    });
    answer(false);
    await expect(pending).resolves.toBe(false);
  });

  it("danger:false varsayılan etiketler Evet/Hayır, odak onayda", async () => {
    confirmStore.setState({ confirmSimpleActions: true });
    const pending = confirm({ title: "Soru", message: "?" });
    expect(confirmStore.getState().request).toMatchObject({
      confirmLabel: "Evet",
      cancelLabel: "Hayır",
      autoFocusTarget: "ok",
    });
    answer(true);
    await pending;
  });
});

describe("confirm()", () => {
  it("soru açar; answer(true) Evet döner ve isteği temizler", async () => {
    const pending = confirm({ title: "Kısayol oluştur", message: "Emin misiniz?" });
    expect(confirmStore.getState().request).toMatchObject({
      title: "Kısayol oluştur",
      danger: false,
      kind: "confirm",
    });
    answer(true);
    await expect(pending).resolves.toBe(true);
    expect(confirmStore.getState().request).toBeNull();
  });

  it("shell.confirmSimpleActions kapalıyken basit işlem sorulmadan Evet; tehlikeli işlem yine sorulur", async () => {
    confirmStore.setState({ confirmSimpleActions: false });
    await expect(confirm({ title: "Basit", message: "?" })).resolves.toBe(true);
    expect(confirmStore.getState().request).toBeNull();

    const danger = confirm({ title: "Sil", message: "?", danger: true });
    expect(confirmStore.getState().request?.title).toBe("Sil");
    answer(false);
    await expect(danger).resolves.toBe(false);
  });

  it("kısayol kaldırma silmedir: confirmSimpleActions kapalıyken de sorulur", async () => {
    confirmStore.setState({ confirmSimpleActions: false });
    const pending = confirmRemoveShortcut("Sistem Ayarları");
    expect(confirmStore.getState().request).toMatchObject({
      title: "Kısayolu kaldır",
      danger: true,
    });
    answer(false);
    await expect(pending).resolves.toBe(false);
  });

  it("yeni soru bekleyen soruyu Hayır ile kapatır; alertDialog tek düğmeli istek açar", async () => {
    const first = confirm({ title: "Bir", message: "?" });
    const second = alertDialog({ title: "Hakkında", message: "Merit OS" });
    await expect(first).resolves.toBe(false);
    expect(confirmStore.getState().request).toMatchObject({ title: "Hakkında", kind: "alert" });
    answer(true);
    await expect(second).resolves.toBe(true);
  });
});
