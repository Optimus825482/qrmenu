import { defineConfig, devices } from "@playwright/test";
import { config } from "dotenv";
import path from "node:path";
import { VIEWPORTS } from "./tests/e2e/matrix/viewports";
import { e2eDatabaseUrl } from "./tests/e2e/e2eDb";

config({ path: path.resolve(__dirname, ".env"), quiet: true });

// E2E_BASE_URL (e.g. http://localhost:3010) lets the suite target another running server.
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "tests/e2e",
  // Every spec resets and re-seeds the one shared e2e database (E2E_DATABASE_URL / DATABASE_URL_TEST, never the dev DB): files must not run in parallel.
  workers: 1,
  // CI uploads playwright-report/ on failure (the default CI reporter writes no HTML report).
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: { baseURL },
  webServer: {
    command: "npm run dev",
    url: baseURL,
    reuseExistingServer: true,
    // The server under test must talk to the same throwaway database the specs reset.
    env: { DATABASE_URL: e2eDatabaseUrl() },
  },
  projects: [
    { name: "chromium", testIgnore: ["**/matrix/**"], use: { ...devices["Desktop Chrome"] } },
    // UX matrix (P-UX-15): the same specs under six views, all touch-capable.
    ...Object.entries(VIEWPORTS).map(([name, viewport]) => ({
      name,
      testMatch: ["**/matrix/**/*.spec.ts"],
      use: {
        ...devices["Desktop Chrome"],
        viewport,
        hasTouch: true,
        ...(name.startsWith("phone-") ? { isMobile: true } : {}),
      },
    })),
  ],
});
