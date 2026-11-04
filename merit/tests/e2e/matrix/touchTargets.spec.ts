import { expect, resetAndSeed, test } from "../fixtures";
import { expectTouchTargets, gapViolations } from "./a11y";
import { ROUTE_MATRIX, openRoute } from "./routes";

test.beforeAll(() => resetAndSeed());

for (const entry of ROUTE_MATRIX) {
  test(`${entry.key}: dokunma hedefleri`, async ({ page }) => {
    await openRoute(page, entry);
    await expectTouchTargets(page, entry.tier, entry.key);
    expect(await gapViolations(page, entry.tier), `target gaps of "${entry.key}"`).toEqual([]);
  });
}
