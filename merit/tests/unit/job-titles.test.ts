import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { JOB_TITLE_CATALOG, groupJobTitleChoices, orderJobTitles, reportsTo } from "@/modules/core/jobTitles";
import { ROLES } from "../../prisma/seed/roles";
import { testDb, truncate } from "../helpers/db";
import { ctxFor, dropReferenceData, makeUser, resetReferenceData, roleByCode } from "../helpers/fixtures";

vi.mock("@/lib/prisma", async () => ({ prisma: (await import("../helpers/db")).testDb }));
const publishMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/realtime", () => ({ publish: publishMock }));

const jobTitles = await import("@/modules/core/server/admin/jobTitles");
const users = await import("@/modules/core/server/admin/users");

const Q = { page: 1, pageSize: 100 } as const;

describe("görev kataloğu (taslak)", () => {
  it("kodlar ve adlar tekildir; üst görev kendinden önce gelir; önerilen rol tanımlıdır", () => {
    const codes = JOB_TITLE_CATALOG.map((t) => t.code);
    expect(new Set(codes).size).toBe(codes.length);
    expect(new Set(JOB_TITLE_CATALOG.map((t) => t.name)).size).toBe(codes.length);
    const roleCodes = new Set(ROLES.map((r) => r.code));
    for (const [index, title] of JOB_TITLE_CATALOG.entries()) {
      if (title.parent) expect(codes.indexOf(title.parent), title.code).toBeLessThan(index);
      expect(roleCodes.has(title.role), `${title.code} → ${title.role}`).toBe(true);
    }
  });

  it("F&B Müdürü'nden garsona inen hat: her görev bir üstüne bağlıdır", () => {
    const rows = JOB_TITLE_CATALOG.map((t) => ({ id: t.code, name: t.name, parentId: t.parent ?? null }));
    expect(reportsTo(rows, "G-GAR", "G-FBM")).toBe(true);
    expect(reportsTo(rows, "G-FBM", "G-GAR")).toBe(false);
    const ordered = orderJobTitles(rows);
    const depth = (code: string) => ordered.find((r) => r.id === code)!.depth;
    expect(depth("G-OTM")).toBe(0);
    expect(depth("G-FBM")).toBe(1);
    expect(depth("G-GAR")).toBeGreaterThan(depth("G-SGF"));
    // A child always sits below its parent in the list.
    for (const row of ordered) {
      if (row.parentId) expect(ordered.findIndex((r) => r.id === row.parentId)).toBeLessThan(ordered.indexOf(row));
    }
  });

  it("döngüye giren ya da üstü olmayan satırlar kaybolmaz", () => {
    const rows = [
      { id: "a", name: "A", parentId: "b" },
      { id: "b", name: "B", parentId: "a" },
      { id: "c", name: "C", parentId: "yok" },
    ];
    expect(orderJobTitles(rows).map((r) => r.id).sort()).toEqual(["a", "b", "c"]);
  });

  it("form seçenekleri bölüm başlıkları altında, bölüm içi girintiyle gruplanır", () => {
    const groups = groupJobTitleChoices([
      { id: "1", name: "Şef Garson", department: "SERVIS", depth: 4, defaultRoleId: null },
      { id: "2", name: "Garson", department: "SERVIS", depth: 5, defaultRoleId: null },
      { id: "3", name: "Bilinmeyen", department: "ESKI", depth: 0, defaultRoleId: null },
    ]);
    expect(groups.map((g) => g.label)).toEqual(["Restoran ve servis", "Diğer"]);
    expect(groups[0].options.map((o) => o.indent)).toEqual([0, 1]);
  });
});

describe("görev servisi", () => {
  beforeAll(resetReferenceData);
  beforeEach(async () => {
    await truncate("audit_logs");
    await resetReferenceData();
    publishMock.mockReset();
  });
  afterAll(async () => {
    await truncate("audit_logs");
    await dropReferenceData();
    await testDb.$disconnect();
  });

  async function sys() {
    const user = await makeUser({ username: "sys-admin", roleCode: "R-SYS", hotelCode: "ROYAL" });
    return ctxFor(user, { hotelCode: "ROYAL", extraHotelCodes: ["PREMIUM", "DIAMOND"] });
  }
  async function fbm() {
    const user = await makeUser({ username: "fbm-mr", roleCode: "R-FBM", hotelCode: "ROYAL" });
    return ctxFor(user, { hotelCode: "ROYAL" });
  }
  const byName = (name: string) => testDb.jobTitle.findUniqueOrThrow({ where: { name } });

  it("seed taslak kataloğu önerilen rollerle kurar; liste hiyerarşi sırasındadır", async () => {
    const ctx = await sys();
    const page = await jobTitles.list(ctx, Q);
    expect(page.total).toBe(JOB_TITLE_CATALOG.length);
    const garson = page.items.find((r) => r.name === "Garson")!;
    expect(garson).toMatchObject({ code: "G-GAR", parentName: "Şef Garson", defaultRoleCode: "R-GAR", department: "SERVIS" });
    expect(garson.depth).toBeGreaterThan(page.items.find((r) => r.name === "F&B Müdürü")!.depth);
    // A search keeps the line above the match.
    const found = await jobTitles.list(ctx, { ...Q, q: "barista" });
    expect(found.items.map((r) => r.name)).toContain("Bar Müdürü");
    expect(found.items.map((r) => r.name)).not.toContain("Garson");
  });

  it("yalnız sistem rolleri düzenler; yönetici listeyi görür", async () => {
    const manager = await fbm();
    expect((await jobTitles.list(manager, Q)).total).toBeGreaterThan(0);
    expect((await jobTitles.options(manager)).canEdit).toBe(false);
    await expect(jobTitles.create(manager, { name: "Sommelier", department: "SERVIS" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("görevi yalnız metin olarak taşıyan (bağlantısız) kullanıcı da o görevin sayısına girer", async () => {
    const ctx = await sys();
    const loose = await makeUser({ username: "gar-metin", roleCode: "R-GAR", hotelCode: "ROYAL" });
    await testDb.user.update({ where: { id: loose.id }, data: { jobTitle: " garson ", jobTitleId: null } });
    const linked = await makeUser({ username: "gar-bagli", roleCode: "R-GAR", hotelCode: "ROYAL" });
    await testDb.user.update({ where: { id: linked.id }, data: { jobTitle: "Garson", jobTitleId: (await byName("Garson")).id } });
    const page = await jobTitles.list(ctx, {});
    expect(page.items.find((row) => row.name === "Garson")?.userCount).toBe(2);
  });

  it("ekleme, döngü reddi, ad değişikliğinin kullanıcılara yansıması ve silme", async () => {
    const ctx = await sys();
    const sef = await byName("Şef Garson");
    const created = await jobTitles.create(ctx, {
      name: "Sommelier",
      department: "SERVIS",
      parentId: sef.id,
      defaultRoleId: (await roleByCode("R-GAR")).id,
    });
    expect(created).toMatchObject({ parentName: "Şef Garson", defaultRoleCode: "R-GAR", userCount: 0 });
    await expect(jobTitles.create(ctx, { name: "sommelier", department: "BAR" })).rejects.toMatchObject({ code: "CONFLICT" });

    // Şef Garson cannot report to something below it.
    await expect(
      jobTitles.update(ctx, sef.id, { name: sef.name, department: "SERVIS", parentId: created.id }),
    ).rejects.toMatchObject({ code: "VALIDATION" });

    const waiter = await makeUser({ username: "som-1", roleCode: "R-GAR", hotelCode: "ROYAL" });
    await testDb.user.update({ where: { id: waiter.id }, data: { jobTitle: "Sommelier", jobTitleId: created.id } });
    await expect(jobTitles.remove(ctx, created.id)).rejects.toMatchObject({ code: "CONFLICT" });

    const renamed = await jobTitles.update(ctx, created.id, { name: "Şarap Garsonu", department: "SERVIS", parentId: sef.id });
    expect(renamed.userCount).toBe(1);
    expect((await testDb.user.findUniqueOrThrow({ where: { id: waiter.id } })).jobTitle).toBe("Şarap Garsonu");

    // Deleting a görev moves the ones below it up one step.
    const garson = await byName("Garson");
    await testDb.user.updateMany({ where: { jobTitleId: sef.id }, data: { jobTitleId: null } });
    await jobTitles.remove(ctx, sef.id);
    expect((await byName("Garson")).parentId).toBe(sef.parentId);
    expect(garson.parentId).toBe(sef.id);
    const actions = (await testDb.auditLog.findMany({ select: { action: true } })).map((a) => a.action);
    expect(actions).toEqual(expect.arrayContaining(["JOB_TITLE_CREATE", "JOB_TITLE_UPDATE", "JOB_TITLE_DELETE"]));
  });

  it("kullanıcı formu görev ağacını önerilen rolle alır; kayıt görevi kataloğa bağlar", async () => {
    const ctx = await sys();
    const options = await users.options(ctx);
    const garson = options.jobTitleTree.find((t) => t.name === "Garson")!;
    expect(garson.defaultRoleId).toBe((await roleByCode("R-GAR")).id);
    expect(options.jobTitles).toContain("Garson");

    const hotel = await testDb.hotel.findUniqueOrThrow({ where: { code: "ROYAL" } });
    const base = { fullName: "Deneme Garson", roleId: garson.defaultRoleId!, hotelId: hotel.id, hotelIds: [], password: "Deneme123" };
    const linked = await users.create(ctx, { ...base, username: "deneme.garson", jobTitle: "Garson" });
    expect((await testDb.user.findUniqueOrThrow({ where: { id: linked.id } })).jobTitleId).toBe(garson.id);
    // A title outside the catalogue stays as text.
    const free = await users.create(ctx, { ...base, username: "deneme.serbest", jobTitle: "Çiçekçi" });
    expect(await testDb.user.findUniqueOrThrow({ where: { id: free.id } })).toMatchObject({ jobTitle: "Çiçekçi", jobTitleId: null });
  });
});
