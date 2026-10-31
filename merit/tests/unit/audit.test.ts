import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { audit } from "@/modules/core/server/audit";
import { testDb, truncate } from "../helpers/db";

describe("audit() (gerçek test DB)", () => {
  beforeEach(async () => {
    await truncate("audit_logs");
  });

  afterAll(async () => {
    await truncate("audit_logs");
    await testDb.$disconnect();
  });

  it("before/after'ı JSON olarak yazar ve geri okur", async () => {
    const before = { name: "Eski", tags: ["a", "b"], nested: { n: 1 } };
    const after = { name: "Yeni", tags: [], nested: { n: 2 } };
    await audit(testDb, {
      action: "hotel.update",
      entity: "Hotel",
      entityId: "h1",
      before,
      after,
      ip: "10.0.0.1",
    });
    const rows = await testDb.auditLog.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      action: "hotel.update",
      entity: "Hotel",
      entityId: "h1",
      ip: "10.0.0.1",
      before,
      after,
    });
    expect(rows[0].createdAt).toBeInstanceOf(Date);
  });

  it("opsiyonel alanlar null kalır", async () => {
    await audit(testDb, { action: "x.y", entity: "Thing" });
    const row = await testDb.auditLog.findFirstOrThrow();
    expect(row.userId).toBeNull();
    expect(row.hotelId).toBeNull();
    expect(row.entityId).toBeNull();
    expect(row.before).toBeNull();
    expect(row.after).toBeNull();
    expect(row.ip).toBeNull();
  });

  it("transaction istemcisiyle çalışır ve rollback'te satır kalmaz", async () => {
    await expect(
      testDb.$transaction(async (tx) => {
        await audit(tx, { action: "tx.test", entity: "Thing", after: { v: 1 } });
        throw new Error("rollback");
      }),
    ).rejects.toThrow("rollback");
    expect(await testDb.auditLog.count()).toBe(0);

    await testDb.$transaction(async (tx) => {
      await audit(tx, { action: "tx.test", entity: "Thing", after: { v: 1 } });
    });
    expect(await testDb.auditLog.count()).toBe(1);
  });
});
