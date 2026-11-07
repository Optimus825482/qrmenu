import { defineConfig, devices } from "@playwright/test";
import path from "node:path";

// Separate config deliberately has no webServer or seed hook: capturing guides never resets a DB
// and is excluded from the normal acceptance suite. Start the isolated training app first.
export default defineConfig({
  testDir: "tests/e2e/guide",
  outputDir: path.resolve(__dirname, "../.superpowers/sdd/2026-10-31-p8-kabul/guide-results"),
  workers: 1,
  retries: 0,
  timeout: 60_000,
  reporter: "list",
  use: { baseURL: process.env.BASE_URL ?? "http://localhost:3100", locale: "tr-TR" },
  projects: [{ name: "kilavuz", use: { ...devices["Desktop Chrome"] } }],
});
