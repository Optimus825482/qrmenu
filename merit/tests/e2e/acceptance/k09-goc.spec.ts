import { execFileSync } from "node:child_process";
import { pbkdf2Sync, randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Client } from "pg";
import { e2eDatabaseUrl } from "../e2eDb";
import { expect, login, resetAndSeed, test, TEST_PASSWORD } from "../fixtures";
import { sql } from "./order-support";

test.use({ locale: "tr-TR" });

test.describe("@kabul-9 sentetik legacy göçü", () => {
  test("kuru çalışma yazmaz; sıfır fark, bakiyeler, ikinci aktarım, eski QR ve parola yükseltme", async ({ page }) => {
    test.setTimeout(180_000);
    resetAndSeed();
    const target = e2eDatabaseUrl(); // guard rejects production/remote databases before any mutation
    const source = new URL(target);
    const name = `merit_legacy_accept_${randomUUID().replaceAll("-", "")}_test`;
    source.pathname = `/${name}`;
    const adminUrl = new URL(target); adminUrl.pathname = "/postgres";
    const admin = new Client({ connectionString: adminUrl.href });
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "merit-k09-"));
    const report = path.join(tmp, "migration-report.md");
    const root = path.resolve(__dirname, "../../..");
    await admin.connect();
    try {
      await admin.query(`CREATE DATABASE "${name}"`);
      const legacy = new Client({ connectionString: source.href });
      await legacy.connect();
      try {
        const salt = "kabul-synthetic";
        const hash = `pbkdf2:sha256:1000$${salt}$${pbkdf2Sync(TEST_PASSWORD, salt, 1000, 32, "sha256").toString("hex")}`;
        await legacy.query(fs.readFileSync(path.join(root, "tests/fixtures/legacy-sample/legacy-sample.sql"), "utf8").replace("WERKZEUG_HASH", hash));
      } finally { await legacy.end(); }
      const run = (dry = false) => execFileSync(process.execPath, [path.join(root, "node_modules/tsx/dist/cli.mjs"),
        path.join(root, "scripts/migrate-from-minibarlatest/index.ts"), "--report", report, "--logo-dir", path.join(tmp, "logos"),
        ...(dry ? ["--dry-run"] : [])], { cwd: root, env: { ...process.env, DATABASE_URL: target, LEGACY_DATABASE_URL: source.href }, encoding: "utf8" });
      const snapshot = () => sql<{ entity: string; n: number }>(`SELECT 'map' AS entity,count(*)::int AS n FROM legacy_id_map
        UNION ALL SELECT 'room',count(*)::int FROM rooms UNION ALL SELECT 'user',count(*)::int FROM users
        UNION ALL SELECT 'tx',count(*)::int FROM minibar_transactions UNION ALL SELECT 'dnd',count(*)::int FROM room_dnds
        UNION ALL SELECT 'mybar',count(*)::int FROM mybar_requests UNION ALL SELECT 'pool',count(*)::int FROM hotel_stocks ORDER BY entity`);
      const before = await snapshot();
      run(true);
      expect(await snapshot()).toEqual(before);
      run();
      const markdown = fs.readFileSync(report, "utf8");
      expect(markdown).toContain("- Sonuç: temiz");
      expect(markdown).not.toContain("- KALDI");
      const counts = [...markdown.matchAll(/\| (\w+) \| (\d+) \| (\d+) \| (\d+) \| (\d+) \| (\d+) \| (-?\d+) \|/g)];
      expect(counts.length).toBeGreaterThan(10);
      for (const row of counts) {
        expect(Number(row[6]), `${row[1]} hatalı`).toBe(0);
        expect(Number(row[7]), `${row[1]} fark`).toBe(0);
      }
      expect(await sql("SELECT id FROM minibar_transactions")).toHaveLength(5);
      expect(await sql("SELECT id FROM mybar_requests")).toHaveLength(2);
      expect(await sql("SELECT id FROM room_dnds")).toHaveLength(1);
      const pools = await sql<{ total_qty: number; used_qty: number; remaining_qty: number }>(`SELECT s.total_qty,s.used_qty,s.remaining_qty FROM hotel_stocks s JOIN legacy_id_map m ON m.new_id=s.id AND m.entity='hotelStock'`);
      expect(pools).toHaveLength(3);
      for (const pool of pools) expect(pool.total_qty - pool.used_qty).toBe(pool.remaining_qty);
      const after = await snapshot();
      run();
      expect(await snapshot()).toEqual(after);
      await page.goto("/q/123456");
      await expect(page.locator(".mb-room-badge")).toContainText("K901");
      await login(page, "kabul.legacy", TEST_PASSWORD);
      await expect(page).not.toHaveURL(/\/giris/);
      const [user] = await sql<{ password_hash: string }>("SELECT password_hash FROM users WHERE username='kabul.legacy'");
      expect(user.password_hash).toMatch(/^\$2[aby]\$/);
    } finally {
      // Identifier is generated above, never accepted from an environment variable or caller.
      await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
      await admin.end();
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});
