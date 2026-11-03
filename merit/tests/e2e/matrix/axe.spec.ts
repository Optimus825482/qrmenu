import { resetAndSeed, test } from "../fixtures";
import { expectNoSeriousAxe } from "./a11y";
import { ROUTE_MATRIX, openRoute } from "./routes";

test.beforeAll(() => resetAndSeed());

for (const entry of ROUTE_MATRIX) {
  test(`${entry.key}: ciddi/kritik axe ihlali yok`, async ({ page }) => {
    await openRoute(page, entry);
    await expectNoSeriousAxe(page, entry.key);
  });
}
