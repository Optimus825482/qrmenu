import { expect, resetAndSeed, test } from "../fixtures";
import { expectNoHorizontalScroll } from "./a11y";
import { KNOWN_SCROLL } from "./knownViolations";
import { ROUTE_MATRIX, openRoute } from "./routes";
import { projectName } from "./viewports";

test.beforeAll(() => resetAndSeed());

for (const entry of ROUTE_MATRIX) {
  test(`${entry.key}: yatay kaydırma yok`, async ({ page }) => {
    await openRoute(page, entry);
    const known = KNOWN_SCROLL[`${entry.key}@${projectName()}`];
    if (known) {
      const { scrollWidth, innerWidth } = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
      }));
      expect(scrollWidth, `${entry.key} is listed in KNOWN_SCROLL (${known}) but fits now: remove it`).toBeGreaterThan(innerWidth);
    } else {
      await expectNoHorizontalScroll(page);
    }
  });
}
