import AxeBuilder from "@axe-core/playwright";
import type { Locator, Page } from "@playwright/test";
import { startMenuItem } from "./definitionsUi";
import { expect } from "./fixtures";

/** Shared flows of the Canlı Radar window specs. */

/** Windows the radar is checked at (spec 5.5: the 1366x768 window and the 1920x1080 wall size). */
export const RADAR_VIEWPORTS = [
  { width: 1366, height: 768 },
  { width: 1920, height: 1080 },
] as const;

/** Opens the radar from the Start menu and resolves to its window (title "Canlı Radar · <scope>"). */
export async function openRadar(page: Page): Promise<Locator> {
  const existing = page.getByRole("region", { name: /^Canlı Radar/ });
  if ((await existing.count()) === 0) {
    await page.getByRole("button", { name: "başlat" }).click();
    await startMenuItem(page, "Canlı Radar").click();
  }
  const win = page.getByRole("region", { name: /^Canlı Radar · / }).first();
  await expect(win).toBeVisible();
  return win;
}

export const radarToolbar = (win: Locator): Locator => win.getByRole("toolbar", { name: "Radar araç çubuğu" });

/** A view tab of the radar toolbar ("Genel Bakış", "Kat", "Masa"). */
export const radarTab = (win: Locator, name: string): Locator =>
  radarToolbar(win).getByRole("tab", { name, exact: true });

/** The table card of `label` (its accessible name is its text: "<label> <status> ... <waiter>"). */
export const tableCard = (win: Locator, label: string): Locator =>
  win.getByRole("button", { name: new RegExp(`^${label}(?![\\w])`) });

/**
 * Serious/critical axe findings of the whole page. The shared `expectNoSeriousAxe` of the UX matrix only runs in
 * the matrix projects (it resolves known violations by project name), so the chromium radar spec scans itself.
 */
export async function expectRadarAxeClean(page: Page, label: string): Promise<void> {
  const { violations } = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  const serious = violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(
    serious.map((v) => `${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`),
    `axe violations of "${label}"`,
  ).toEqual([]);
}
