import { config } from "dotenv";
import { execFileSync } from "node:child_process";
import { randomInt } from "node:crypto";
import path from "node:path";
import { expect, test as base, type Page } from "@playwright/test";

config({ path: path.resolve(__dirname, "../../.env"), quiet: true });

export const TEST_PASSWORD = "Test!2026";
export const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "";

/**
 * Empties every application table of the DEV database (the one the dev server uses, DATABASE_URL),
 * re-runs the seed and creates the e2e staff users. Refuses to touch the unit-test database.
 * The work happens in seed-e2e.ts under tsx: the generated Prisma client is ESM-only and cannot
 * be imported by Playwright's CommonJS test loader.
 */
export function resetAndSeed(opts: { guestMenu?: boolean } = {}): void {
  const root = path.resolve(__dirname, "../..");
  execFileSync(
    process.execPath,
    [path.join(root, "node_modules/tsx/dist/cli.mjs"), path.join(__dirname, "seed-e2e.ts")],
    { cwd: root, stdio: "inherit", env: { ...process.env, SEED_GUEST_MENU: opts.guestMenu ? "1" : "0" } },
  );
}

/**
 * Every test gets its own client IP (X-Forwarded-For): the login rate limiter allows 5 attempts
 * per minute per IP, and a whole spec logs in more often than that from one machine.
 */
export const test = base.extend<{ clientIp: void }>({
  clientIp: [
    async ({ context }, use) => {
      const ip = `10.${randomInt(1, 255)}.${randomInt(1, 255)}.${randomInt(1, 255)}`;
      await context.setExtraHTTPHeaders({ "x-forwarded-for": ip });
      await use();
    },
    { auto: true },
  ],
});

export { expect };

/** Fills the login form and submits it. Does not wait for navigation. */
export async function login(
  page: Page,
  username: string,
  password: string = username === "admin" ? ADMIN_PASSWORD : TEST_PASSWORD,
): Promise<void> {
  await page.goto("/giris");
  await page.getByLabel("Kullanıcı adı").fill(username);
  await page.getByLabel("Şifre").fill(password);
  await page.getByRole("button", { name: "Giriş Yap" }).click();
}
