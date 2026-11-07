import { chromium, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { setTimeout as sleep } from "node:timers/promises";
import type { Targets } from "./targets";
import { HttpMetrics } from "./metrics";
import type { CreatedMybar, CreatedOrder } from "./guestFlow";
export type StaffSession = Targets["staff"][number] & { cookie: string; context: BrowserContext };
export async function loginStaff(browser: Browser, baseUrl: string, staff: Targets["staff"], password: string, metrics: HttpMetrics): Promise<StaffSession[]> {
  const result: StaffSession[] = [];
  for (const [index, user] of staff.entries()) {
    const start = performance.now();
    const context = await browser.newContext({ baseURL: baseUrl, extraHTTPHeaders: { "x-forwarded-for": `10.252.0.${index + 1}` } });
    // Runner owns and measures SSE connections; UI background EventSource must not double them.
    await context.route("**/api/sse", (route) => route.abort());
    const page = await context.newPage();
    try {
      await page.goto("/giris"); await page.getByLabel("Kullanıcı adı").fill(user.username); await page.getByLabel("Şifre").fill(password);
      await page.getByRole("button", { name: "Giriş Yap" }).click();
      await page.waitForTimeout(200);
      const choice = page.getByRole("button", { name: new RegExp(user.outletName ?? (user.role === "oda" ? "Oda Servisi" : "Yük Bar 1")) }).first();
      const hotelChoice = page.getByRole("button", { name: /Merit Royal/ }).first();
      await Promise.race([choice.waitFor({ state: "visible", timeout: 15_000 }), hotelChoice.waitFor({ state: "visible", timeout: 15_000 }), page.waitForURL((url) => !/\/(giris|secim)$/.test(url.pathname), { timeout: 15_000 })]);
      if (await choice.isVisible()) await choice.click(); else if (await hotelChoice.isVisible()) await hotelChoice.click();
      await page.waitForURL((url) => !/\/(giris|secim)$/.test(url.pathname), { timeout: 15_000 });
      const cookies = await context.cookies(baseUrl);
      if (!cookies.length) throw new Error("No session");
      result.push({ ...user, cookie: cookies.map((c) => `${c.name}=${c.value}`).join("; "), context });
      metrics.record("staff", performance.now() - start, 200);
    } catch {
      console.error("Yük personeli giriş aşaması", { username: user.username, path: new URL(page.url()).pathname, buttons: await page.getByRole("button").allTextContents().catch(() => []) });
      metrics.record("staff", performance.now() - start, 0); await context.close();
      throw new Error(`Yük personeli giriş yapamadı: ${user.username}`);
    } finally { await page.close(); }
  }
  return result;
}
export const launchStaffBrowser = () => chromium.launch({ headless: true });

/** Real UI approval / kitchen / waiter transitions: no direct DB writes impersonate load. */
export async function operateOrders(sessions: StaffSession[], stop: AbortSignal, orders: CreatedOrder[], mybars: CreatedMybar[], metrics: HttpMetrics): Promise<{ approved: number; served: number; delivered: number; mybarClosed: number }> {
  const pages = new Map<string, Page>();
  for (const session of sessions.filter((s) => ["kasa", "kds", "garson", "oda", "kat"].includes(s.role))) pages.set(session.username, await session.context.newPage());
  const pageFor = (role: string, outletId?: string) => {
    const session = sessions.find((s) => s.role === role && (!outletId || s.outletId === outletId));
    return session ? pages.get(session.username) : undefined;
  };
  let approved = 0, served = 0, delivered = 0, mybarClosed = 0;
  const done = new Set<string>();
  const mybarDone = new Set<string>();
  try {
    while (!stop.aborted) {
      for (const order of orders) {
        if (done.has(order.id) || stop.aborted || Date.now() - order.createdAt < 2000) continue;
        const roomOps = pageFor("oda");
        if (order.kind === "room") {
          if (!roomOps) continue;
          try {
            await roomOps.goto("/oda-servisi");
            const card = roomOps.locator(`[data-order-id="${order.id}"]`);
            await card.waitFor({ state: "visible", timeout: 5000 });
            const confirm = card.getByRole("button", { name: "Telefonla teyit edildi", exact: true });
            if (await confirm.isVisible()) await confirm.click();
            order.startedAt = Date.now();
            for (const label of ["Onayla", "Hazır", "Yola çıktı", "Teslim edildi"]) await card.getByRole("button", { name: label, exact: true }).click({ timeout: 5000 });
            approved++; delivered++; done.add(order.id);
          } catch (error) { if (!stop.aborted) { console.error("Oda zinciri", error instanceof Error ? error.message.split("\n")[0] : "error"); metrics.record("staff", 0, 0); } done.add(order.id); }
          continue;
        }
        const cashier = pageFor("kasa", order.outletId), kitchen = pageFor("kds", order.outletId), waiter = pageFor("garson", order.outletId);
        if (!cashier) continue;
        let step = "queue";
        try {
          await cashier.goto("/kasa?bolum=kuyruk");
          const rail = cashier.getByRole("navigation", { name: "Personel bölümleri" }).getByRole("link", { name: /^Kuyruk/ });
          if (await rail.isVisible()) await rail.click();
          const card = cashier.getByRole("region", { name: "Onay kuyruğu" }).getByRole("article").filter({ hasText: new RegExp(`#${order.orderNo}\\b`) });
          await card.waitFor({ state: "visible", timeout: 5000 });
          const approve = card.getByRole("button", { name: /Onayla/ });
          if (!await approve.isVisible()) { done.add(order.id); continue; }
          step = "approve"; order.startedAt = Date.now(); await approve.click({ timeout: 5000 }); approved++;
          if (kitchen) {
            step = "kitchen-start"; await kitchen.goto("/kds");
            const kcard = kitchen.getByRole("article").filter({ hasText: new RegExp(`#${order.orderNo}\\b`) });
            await kcard.getByRole("button", { name: "Başla", exact: true }).click({ timeout: 5000 });
            step = "kitchen-ready"; await kcard.getByRole("button", { name: "Hazır", exact: true }).click({ timeout: 5000 });
          }
          if (waiter) {
            step = "serve"; await waiter.goto("/garson"); await waiter.getByRole("tab", { name: "Masalarım" }).click({ timeout: 5000 });
            await waiter.getByText(new RegExp(`^#${order.orderNo} ·`)).locator("..").getByRole("button", { name: "Servis edildi" }).click({ timeout: 5000 }); served++;
          }
          done.add(order.id);
        } catch (error) { if (!stop.aborted) { console.error("Masa zinciri", step, error instanceof Error ? error.message.slice(0, 1800) : "error"); if (kitchen) await kitchen.screenshot({ path: "tools/load/.tmp/kitchen-diagnostic.png" }).catch(() => {}); metrics.record("staff", 0, 0); } done.add(order.id); }
      }
      const kat = pageFor("kat");
      if (kat) for (const req of mybars) {
        if (mybarDone.has(req.id) || stop.aborted) continue;
        try {
          await kat.goto("/kat/mybar");
          const ack = kat.getByRole("alertdialog").getByRole("button", { name: "Gördüm", exact: true });
          while (await ack.isVisible()) { await ack.click(); await kat.waitForTimeout(100); }
          const row = kat.getByTestId("mybar-row").filter({ hasText: new RegExp(`\\b${req.roomNumber}\\b`) });
          await row.waitFor({ state: "visible", timeout: 5000 });
          await row.getByRole("button", { expanded: false }).click();
          const all = kat.getByRole("button", { name: "Tümünü Karşıla", exact: true });
          if (await all.isVisible()) await all.click();
          await kat.getByRole("button", { name: "Talebi Kapat", exact: true }).click();
          const dialog = kat.getByRole("dialog");
          const reason = dialog.getByRole("textbox");
          if (await reason.isVisible()) await reason.fill("Yerel yük denemesi tamamlandı");
          await dialog.getByRole("button", { name: "Kapat", exact: true }).click();
          mybarClosed++; mybarDone.add(req.id);
        } catch (error) { if (!stop.aborted) { console.error("MyBar zinciri", error instanceof Error ? error.message.split("\n")[0] : "error"); metrics.record("staff", 0, 0); } mybarDone.add(req.id); }
      }
      await sleep(1000, undefined, { signal: stop }).catch(() => {});
    }
    return { approved, served, delivered, mybarClosed };
  } finally { for (const page of pages.values()) await page.close(); }
}
