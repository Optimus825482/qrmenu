import { readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { testDb } from "../helpers/db";
import { dropReferenceData, resetReferenceData } from "../helpers/fixtures";

const sql = readFileSync(
  path.resolve(__dirname, "../../prisma/migrations/20261103120000_canli_radar/migration.sql"),
  "utf8",
);
const dataBlock = sql.slice(sql.indexOf("-- @data:begin"), sql.indexOf("-- @data:end"));

async function applyData() {
  expect(dataBlock.length).toBeGreaterThan(0);
  const statements = dataBlock
    .split(/;\s*\n/)
    .map((x) => x.replace(/^\s*--.*$/gm, "").trim())
    .filter((x) => x.length > 0);
  for (const statement of statements) await testDb.$executeRawUnsafe(statement);
}

async function screens() {
  return (await testDb.appScreen.findMany({ orderBy: { sortOrder: "asc" } })).map((s) => [s.code, s.sortOrder] as const);
}
async function matrix() {
  const rows = await testDb.roleScreenPermission.findMany({
    where: { hotelId: null, screen: { code: "CR-RAD" } },
    include: { role: true },
    orderBy: { role: { code: "asc" } },
  });
  return rows.map((r) => [r.role.code, r.canView, r.canCreate, r.canEdit, r.canApprove, r.canReport]);
}

beforeAll(resetReferenceData);
afterAll(async () => {
  await dropReferenceData();
  await testDb.$disconnect();
});

describe("migration veri bloğu (@data) - CR-RAD", () => {
  it("33 ekranlı eski duruma uygulanınca ekran listesi ve izinler seed çıktısıyla aynıdır; ikinci uygulama değiştirmez", async () => {
    const seededScreens = await screens();
    const seededMatrix = await matrix();
    const seededTotal = await testDb.roleScreenPermission.count();
    expect(seededMatrix.length).toBe(4);

    // Back to the pre-radar state: no CR-RAD, later screens one place earlier.
    await testDb.appScreen.delete({ where: { code: "CR-RAD" } });
    await testDb.$executeRawUnsafe(
      `UPDATE "app_screens" SET "sort_order" = "sort_order" - 1 WHERE "sort_order" > (SELECT "sort_order" FROM "app_screens" WHERE "code" = 'CR-KOM')`,
    );
    expect(await testDb.appScreen.count()).toBe(seededScreens.length - 1);

    await applyData();
    expect(await screens()).toEqual(seededScreens);
    expect(await matrix()).toEqual(seededMatrix);
    expect(await testDb.roleScreenPermission.count()).toBe(seededTotal);

    await applyData();
    expect(await screens()).toEqual(seededScreens);
    expect(await testDb.roleScreenPermission.count()).toBe(seededTotal);
  });

  it("DDL operation_events tablosunu ve yedi tekrar indeksini içerir", () => {
    expect(sql).toContain('CREATE TABLE "operation_events"');
    for (const idx of [
      "operation_events_hotel_id_at_idx",
      "order_events_at_idx",
      "qr_scan_logs_created_at_idx",
      "waiter_calls_outlet_id_created_at_idx",
      "session_events_created_at_idx",
      "room_dnd_checks_at_idx",
      "room_checks_check_date_idx",
      "task_status_logs_created_at_idx",
    ]) {
      expect(sql).toContain(`CREATE INDEX "${idx}"`);
    }
  });
});
