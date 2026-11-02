import type { Locator, Page } from "@playwright/test";
import { expect } from "./fixtures";

/**
 * Shared selectors of the Tanımlamalar / Kullanıcı / Ekip windows.
 *
 * Every successful save in a FormDialog ends with an "İşlem tamamlandı" message box that must be
 * acknowledged (the dialog closes after "Tamam"); editing an existing record first asks
 * "Değişikliği onayla"; deleting asks first and ends with "Kayıt silindi".
 */

export const node = (win: Locator, name: string) => win.getByRole("treeitem", { name, exact: true });
export const row = (win: Locator, text: string) => win.getByRole("row").filter({ hasText: text });
export const startMenuItem = (page: Page, name: string) =>
  page.getByRole("menu", { name: "Başlat menüsü" }).getByRole("menuitem", { name, exact: true });

/** Clicks "Tamam" of an information box (default: the one every FormDialog save ends with). */
export async function acknowledge(page: Page, title = "İşlem tamamlandı"): Promise<void> {
  const box = page.getByRole("alertdialog", { name: title, exact: true });
  await expect(box).toBeVisible();
  await box.getByRole("button", { name: "Tamam" }).click();
  await expect(box).toHaveCount(0);
}

/** Answers a Evet / Hayır question box. */
export async function answer(page: Page, title: string, choice: "Evet" | "Hayır"): Promise<void> {
  const box = page.getByRole("dialog", { name: title, exact: true });
  await expect(box).toBeVisible();
  await box.getByRole("button", { name: choice, exact: true }).click();
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

/** Deletes the selected record through the toolbar: confirm, then the "Kayıt silindi" message. */
export async function deleteSelected(page: Page, win: Locator, askTitle: string): Promise<void> {
  await win.getByRole("button", { name: "Seçili kaydı sil" }).click();
  await answer(page, askTitle, "Evet");
  await acknowledge(page, "Kayıt silindi");
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
