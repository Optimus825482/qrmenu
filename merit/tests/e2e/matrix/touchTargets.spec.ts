import { resetAndSeed, test } from "../fixtures";
import { expectTouchTargets } from "./a11y";
import { ROUTE_MATRIX, openRoute } from "./routes";

test.beforeAll(() => resetAndSeed());

for (const entry of ROUTE_MATRIX) {
  test(`${entry.key}: dokunma hedefleri`, async ({ page }) => {
    await openRoute(page, entry);
    await expectTouchTargets(page, entry.tier, entry.key);
  });
}
