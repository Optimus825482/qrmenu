import { expect, resetAndSeed, test } from "../fixtures";
import { expectNoHorizontalScroll, expectNoSeriousAxe } from "./a11y";
import { projectName } from "./viewports";

/**
 * Guest menu (`/q/<token>`) in the phone view: no horizontal scroll and no serious/critical axe
 * violation, left-to-right (tr) and right-to-left (ar). Message parity of the 8 languages is i18n.test.ts.
 */
const M1 = "/q/e2e-guest-m1";

test.beforeAll(() => resetAndSeed({ guestMenu: true }));
test.beforeEach(() => {
  test.skip(projectName() !== "phone-390x844", "misafir menüsü yalnız 390×844 görünümünde denetlenir");
});

for (const [key, lang, dir] of [
  ["misafir-menu", "tr", "ltr"],
  ["misafir-menu-ar", "ar", "rtl"],
] as const) {
  test(`${key}: yatay kaydırma yok ve ciddi/kritik axe ihlali yok (${dir})`, async ({ page }) => {
    await page.goto(`${M1}?lang=${lang}`);
    await expect(page.locator("html")).toHaveAttribute("dir", dir);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Havuz Bar");
    await expectNoHorizontalScroll(page);
    await expectNoSeriousAxe(page, key);
  });

  // The open language menu has its own colours (.g-lang-item); a closed menu hides contrast bugs there.
  test(`${key}-dil-menusu: dil menüsü açıkken ciddi/kritik axe ihlali yok (${dir})`, async ({ page }) => {
    await page.goto(`${M1}?lang=${lang}`);
    await expect(page.locator("html")).toHaveAttribute("dir", dir);
    await page.locator(".g-lang-btn").click();
    await expect(page.getByRole("menu")).toBeVisible();
    await expectNoSeriousAxe(page, `${key}-dil-menusu`);
  });
}
