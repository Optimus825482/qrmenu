import type { Page } from "@playwright/test";
import { answer, appWindow } from "../definitionsUi";
import { expect, login, resetAndSeed, test } from "../fixtures";
import { shiftSession, sql } from "../helpers/acceptanceDb";
import { runJob } from "../helpers/runJob";
import { newContextPage, openAdminShell } from "../menuUi";

/**
 * Kabul 3 (spec §15): oturum azami süre, uyarı, hareketsizlik, tek cihaz ve zorla çıkış kuralları çalışır; online
 * liste ≤ 2 sn gecikmeli. Zaman, gerçek saat beklenmeden kontrollü iş koşucusu (session.sweep) ve DB kaydırması ile
 * sürülür.
 */
test.describe.configure({ mode: "serial" });
test.use({ locale: "tr-TR" });

test.beforeAll(() => {
  resetAndSeed();
});

const sessionOf = async (username: string) =>
  (
    await sql<{ status: string; logout_reason: string | null; mins: number }>(
      `SELECT s.status::text AS status, s.logout_reason::text AS logout_reason,
              round(extract(epoch FROM (s.expires_at - s.login_at)) / 60)::int AS mins
         FROM user_sessions s JOIN users u ON u.id = s.user_id
        WHERE u.username = $1 ORDER BY s.login_at DESC LIMIT 1`,
      [username],
    )
  )[0];

const warnCount = async (username: string) =>
  Number(
    (
      await sql<{ n: string }>(
        `SELECT count(*) AS n FROM notifications n JOIN users u ON u.id = n.user_id
          WHERE u.username = $1 AND n.type = 'session.warn'`,
        [username],
      )
    )[0].n,
  );

async function loginIn(browserPage: Page, username: string, url: RegExp): Promise<void> {
  await login(browserPage, username);
  await expect(browserPage).toHaveURL(url);
}

test.describe("@kabul-3 oturum kuralları", () => {
  test("@kabul-3 tek cihaz: aynı kullanıcı ikinci bağlamda girince ilki /giris'e düşer (TEK_CIHAZ)", async ({ browser }) => {
    const first = await newContextPage(browser);
    const second = await newContextPage(browser);
    try {
      await loginIn(first, "kat2.mr", /\/kat$/);
      await loginIn(second, "kat2.mr", /\/kat$/);
      await expect(first).toHaveURL(/\/giris/, { timeout: 5000 });
      const rows = await sql<{ logout_reason: string | null; status: string }>(
        `SELECT s.logout_reason::text, s.status::text FROM user_sessions s JOIN users u ON u.id = s.user_id
          WHERE u.username = 'kat2.mr' ORDER BY s.login_at`,
      );
      expect(rows).toHaveLength(2);
      expect(rows[0].logout_reason).toBe("TEK_CIHAZ");
      expect(rows[1].status).toBe("ONLINE");
    } finally {
      await first.context().close();
      await second.context().close();
    }
  });

  test("@kabul-3 azami süre rol bazlıdır: kat.mr 600 dk, garson.havuz 480 dk", async ({ browser }) => {
    const kat = await newContextPage(browser);
    const garson = await newContextPage(browser);
    try {
      await loginIn(kat, "kat.mr", /\/kat$/);
      await login(garson, "garson.havuz");
      await garson.getByRole("button", { name: /^Havuz Bar/ }).click(); // two outlets: the session starts at the pick
      await expect(garson).not.toHaveURL(/\/(giris|secim)/);
      expect((await sessionOf("kat.mr")).mins).toBe(600);
      expect((await sessionOf("garson.havuz")).mins).toBe(480);
    } finally {
      await kat.context().close();
      await garson.context().close();
    }
  });

  test("@kabul-3 uyarı bir kez, süre aşımı ve hareketsizlik oturumu kapatır (iş koşucusu ile)", async ({ browser }) => {
    const warned = await newContextPage(browser);
    const expired = await newContextPage(browser);
    const idle = await newContextPage(browser);
    try {
      await loginIn(warned, "kat.mr", /\/kat$/);
      await loginIn(expired, "depo.mr", /\/depo/);
      await loginIn(idle, "mudur.mr", /\/admin/);

      // UYARI: 30 dk kaldı (uyarı eşiği 60 dk) → durum UYARI + bir bildirim; ikinci koşu yeni bildirim üretmez.
      await shiftSession("kat.mr", { expiresInMin: 30 });
      runJob("session.sweep", new Date());
      expect((await sessionOf("kat.mr")).status).toBe("UYARI");
      expect(await warnCount("kat.mr")).toBe(1);
      runJob("session.sweep", new Date());
      expect(await warnCount("kat.mr")).toBe(1);

      // SURE_ASIMI: süre bitmiş → kapanır, sonraki istek /giris'e gider.
      await shiftSession("depo.mr", { expiresInMin: -1 });
      runJob("session.sweep", new Date());
      const closed = await sessionOf("depo.mr");
      expect(closed.status).not.toBe("ONLINE");
      expect(closed.logout_reason).toBe("SURE_ASIMI");
      await expired.goto("/depo");
      await expect(expired).toHaveURL(/\/giris/);

      // HAREKETSIZLIK: 50 dk sessiz (eşik 45 dk).
      await shiftSession("mudur.mr", { lastSeenAgoMin: 50 });
      runJob("session.sweep", new Date());
      expect((await sessionOf("mudur.mr")).logout_reason).toBe("HAREKETSIZLIK");
      await idle.goto("/admin");
      await expect(idle).toHaveURL(/\/giris/);
    } finally {
      await warned.context().close();
      await expired.context().close();
      await idle.context().close();
    }
  });

  test("@kabul-3 online liste ≤ 2 sn: giriş listede belirir; zorla çıkış kurbanı /giris'e düşürür ve satırı kaldırır", async ({
    page,
    browser,
  }) => {
    await openAdminShell(page);
    const win = await appWindow(page, "Online Kullanıcılar", "Merit Royal");
    await expect(win.getByRole("row", { name: /kat2\.mr/ })).toHaveCount(0);

    const victim = await newContextPage(browser);
    try {
      const started = Date.now();
      await login(victim, "kat2.mr");
      await expect(victim).toHaveURL(/\/kat$/);
      const row = win.getByRole("row", { name: /kat2\.mr/ });
      const loggedInAt = Date.now();
      await expect(row).toBeVisible({ timeout: 2000 });
      const lag = Date.now() - loggedInAt;
      expect(lag, `liste gecikmesi ${lag} ms (giriş ${loggedInAt - started} ms)`).toBeLessThanOrEqual(2000);
      await expect(row).toContainText("Çevrimiçi");

      await row.click();
      const forced = Date.now();
      await win.getByRole("button", { name: "Zorla çıkış" }).click();
      await answer(page, "Zorla çıkış", "Evet");
      await expect(victim).toHaveURL(/\/giris/, { timeout: 2000 });
      await expect(row).toHaveCount(0, { timeout: 2000 });
      expect(Date.now() - forced).toBeLessThan(6000);
      expect((await sessionOf("kat2.mr")).logout_reason).toBe("ZORUNLU");
    } finally {
      await victim.context().close();
    }
  });
});
