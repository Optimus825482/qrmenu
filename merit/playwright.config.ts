import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  // Every spec resets and re-seeds the one shared dev database: files must not run in parallel.
  workers: 1,
  use: { baseURL: "http://localhost:3000" },
  webServer: {
    command: "npm run dev",
    port: 3000,
    reuseExistingServer: true,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
