import type { Locator, Page } from "@playwright/test";
import { expect } from "./fixtures";

/**
 * Shared selectors of the Tanımlamalar / Kullanıcı / Ekip windows.
 *
 * A successful save or delete shows no modal any more: the FormDialog closes and a non-blocking
 * tray balloon (snackbar on mobile) reports the result (`acknowledge`). Editing an existing record
 * still asks one confirmation ("Değişikliği onayla"); deleting asks once ("Sil" / "Vazgeç").
 * Failures stay a message box (`dismissError`).
 */

export const node = (win: Locator, name: string) => win.getByRole("treeitem", { name, exact: true });
export const row = (win: Locator, text: string) => win.getByRole("row").filter({ hasText: text });
export const startMenuItem = (page: Page, name: string) =>
  page.getByRole("menu", { name: "Başlat menüsü" }).getByRole("menuitem", { name, exact: true });

/**
 * Waits for the non-blocking success notice (tray balloon / snackbar, role "status", optionally
 * containing `text`) and checks that no modal dialog is left open. A legacy dialog-title argument
 * ("Islem tamamlandi", "Kayit silindi") is ignored: those titles no longer exist.
 */
export async function acknowledge(page: Page, text?: string | RegExp): Promise<void> {
  const legacy = typeof text === "string" && /^(İşlem tamamlandı|Kayıt silindi)$/.test(text);
  const notice = page.getByRole("status").and(page.locator(".xp-balloon, .ui-snackbar"));
  const shown = text && !legacy ? notice.filter({ hasText: text }) : notice;
  await expect(shown.first()).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
}

/** Clicks "Tamam" of an error message box (failures still block, by design). */
export async function dismissError(page: Page, title: string): Promise<void> {
  const box = page.getByRole("alertdialog", { name: title, exact: true });
  await expect(box).toBeVisible();
  await box.getByRole("button", { name: "Tamam" }).click();
  await expect(box).toHaveCount(0);
}

/** Answers the single confirmation box: "Evet" = confirm button, "Hayır" = cancel (labels vary: Sil / Vazgeç ...). */
export async function answer(page: Page, title: string, choice: "Evet" | "Hayır"): Promise<void> {
  const box = page.getByRole("dialog", { name: title, exact: true });
  await expect(box).toBeVisible();
  await box.locator(`[data-confirm="${choice === "Evet" ? "ok" : "cancel"}"]`).click();
  await expect(box).toHaveCount(0);
}

/** Saves the open FormDialog of a *new* record and acknowledges the success message. */
export async function saveNew(page: Page, dialog: Locator, submitText = "Kaydet"): Promise<void> {
  await dialog.getByRole("button", { name: submitText, exact: true }).click();
  await acknowledge(page);
  await expect(dialog).toHaveCount(0);
}

/** Saves the open FormDialog of an *existing* record: confirm, then acknowledge. */
export async function saveEdit(page: Page, dialog: Locator): Promise<void> {
  await dialog.getByRole("button", { name: "Kaydet", exact: true }).click();
  await answer(page, "Değişikliği onayla", "Evet");
  await acknowledge(page);
  await expect(dialog).toHaveCount(0);
}

/** Deletes the selected record through the toolbar: one confirmation, then the "... silindi" notice. */
export async function deleteSelected(page: Page, win: Locator, askTitle: string): Promise<void> {
  await win.getByRole("button", { name: "Seçili kaydı sil" }).click();
  await answer(page, askTitle, "Evet");
  await acknowledge(page, /silindi|kaldırıldı/);
}

/** The hotel card of `hotelName` inside the picker region of a window that has no hotel yet. */
export async function pickHotel(page: Page, appName: string, hotelName: string): Promise<void> {
  const escaped = hotelName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  await page
    .getByRole("region", { name: appName, exact: true })
    .getByRole("button", { name: new RegExp(`^${escaped} logosu\\s+${escaped}$`) })
    .click();
}

/**
 * The window of `title` (for hotel-bound apps: bound to `hotelName`). A window restored from the
 * saved layout is reused; otherwise it is opened from the Start menu (and the hotel picked).
 */
export async function appWindow(page: Page, title: string, hotelName?: string): Promise<Locator> {
  const fullName = hotelName ? `${title} · ${hotelName}` : title;
  const existing = page.getByRole("region", { name: fullName, exact: true });
  if ((await existing.count()) > 0) {
    // Restored windows may sit under others: bring it to the front before it is used.
    await existing.first().dispatchEvent("pointerdown");
    return existing.first();
  }
  await page.getByRole("button", { name: "başlat" }).click();
  await startMenuItem(page, title).click();
  const win = page.getByRole("region", { name: fullName, exact: true }).last();
  if (hotelName) {
    // Users with several hotels pick one first; a single-hotel user gets the bound window straight away.
    const escaped = hotelName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const card = page
      .getByRole("region", { name: title, exact: true })
      .getByRole("button", { name: new RegExp(`^${escaped} logosu\\s+${escaped}$`) });
    await expect(card.or(win).first()).toBeVisible();
    if (await card.isVisible()) await card.click();
  }
  await expect(win).toBeVisible();
  return win;
}

/** The "Yeni kullanıcı" onboarding wizard; its title changes per step, so it is found by its id. */
export const userWizard = (page: Page): Locator =>
  page.locator('section[role="dialog"][aria-labelledby="user-create-title"]');
