import { defineConfig, devices } from "@playwright/test";
import { config } from "dotenv";
import path from "node:path";
import { generateVAPIDKeys } from "web-push";
import { VIEWPORTS } from "./tests/e2e/matrix/viewports";
import { e2eDatabaseUrl } from "./tests/e2e/e2eDb";

config({ path: path.resolve(__dirname, ".env"), quiet: true });

// Web Push specs need a VAPID pair on the server under test. When none is configured, a throwaway pair is generated
// for the dev server this config starts (never written to disk or .env). A server you start yourself needs
// VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY in its own environment, e.g. from `npx web-push generate-vapid-keys`.
const vapid: Record<string, string> = (() => {
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) return {} as Record<string, string>;
  const keys = generateVAPIDKeys();
  return { VAPID_PUBLIC_KEY: keys.publicKey, VAPID_PRIVATE_KEY: keys.privateKey };
})();

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
    env: { DATABASE_URL: e2eDatabaseUrl(), ...vapid },
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
