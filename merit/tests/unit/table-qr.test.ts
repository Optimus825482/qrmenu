import { unzipSync } from "fflate";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { generateQrToken, isSignedToken, verifyQrToken } from "@/lib/qr";
import { testDb } from "../helpers/db";
import {
  ctxFor,
  dropReferenceData,
  hotelId,
  makeUser,
  resetReferenceData,
  resetTestData,
} from "../helpers/fixtures";

vi.mock("@/lib/prisma", async () => ({ prisma: (await import("../helpers/db")).testDb }));
const publishMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/realtime", () => ({ publish: publishMock }));
const requireUser = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth", () => ({ requireUser }));

const tableQr = await import("@/modules/menu/server/tableQr");
const { resolveGuestToken } = await import("@/modules/menu/server/guestToken");
const tableRoute = await import("@/app/api/qr/table/[tableId]/route");
const zipRoute = await import("@/app/api/qr/outlet/[outletId]/zip/route");
const printRoute = await import("@/app/api/qr/outlet/[outletId]/print/route");

beforeAll(resetReferenceData);
beforeEach(async () => {
  await testDb.qrScanLog.deleteMany({});
  await testDb.outletTable.deleteMany({});
  await resetTestData();
  await testDb.auditLog.deleteMany({});
  await testDb.qrScanLog.deleteMany({});
  await testDb.hotelModule.updateMany({ data: { enabled: true } });
  publishMock.mockReset();
  requireUser.mockReset();
});
afterAll(async () => {
  await dropReferenceData();
  await testDb.$disconnect();
});

const meta = { ip: "10.0.0.1", userAgent: "vitest" };

async function fbm() {
  const user = await makeUser({ username: "fbm", roleCode: "R-FBM", hotelCode: "MR" });
  return ctxFor(user, { hotelCode: "MR" });
}
async function newOutlet(name = "Havuz Bar") {
  return testDb.outlet.create({
    data: { hotelId: await hotelId("MR"), name, type: "BAR", hasMenu: true },
  });
}
async function newTables(outletId: string, n = 5, qrToken: (i: number) => string | null = (i) => `placeholder-token-${i}-xx`) {
  const out = [];
  for (let i = 1; i <= n; i++) {
    out.push(await testDb.outletTable.create({ data: { outletId, label: `M${i}`, qrToken: qrToken(i) } }));
  }
  return out;
}
const params = <T extends Record<string, string>>(p: T) => ({ params: Promise.resolve(p) });

describe("tableQr.regenerate", () => {
  it("30 karakterlik imzalı token yazar, eski token çözülmez, audit yalnız son 4 karakteri tutar", async () => {
    const ctx = await fbm();
    const outlet = await newOutlet();
    const [table] = await newTables(outlet.id, 1);
    const oldToken = table.qrToken!;
    const result = await tableQr.regenerate(ctx, table.id);
    const row = await testDb.outletTable.findUniqueOrThrow({ where: { id: table.id } });
    expect(row.qrToken).toHaveLength(30);
    expect(verifyQrToken(row.qrToken!, "TABLE", table.id)).toBe(true);
    expect(result.signed).toBe(true);
    expect(await resolveGuestToken(oldToken, meta)).toMatchObject({ kind: "NONE", reason: "BILINMEYEN" });
    const audits = await testDb.auditLog.findMany({ where: { action: "TABLE_QR_REGENERATE" } });
    expect(audits).toHaveLength(1);
    const json = JSON.stringify(audits[0]);
    expect(json).not.toContain(oldToken);
    expect(json).not.toContain(row.qrToken!);
    expect((audits[0].before as { qrToken: string }).qrToken).toBe(oldToken.slice(-4));
  });

  it("R-GAR FORBIDDEN", async () => {
    const outlet = await newOutlet();
    const [table] = await newTables(outlet.id, 1);
    const user = await makeUser({ username: "gar", roleCode: "R-GAR", hotelCode: "MR" });
    const ctx = await ctxFor(user, { hotelCode: "MR" });
    await expect(tableQr.regenerate(ctx, table.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(tableQr.regenerateAll(ctx, outlet.id, {})).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect((await testDb.outletTable.findUniqueOrThrow({ where: { id: table.id } })).qrToken).toBe(table.qrToken);
  });
});

describe("tableQr.regenerateAll", () => {
  it("onlyUnsigned: yer tutucu/boş tokenlı 3 masayı değiştirir, imzalıyı atlar", async () => {
    const ctx = await fbm();
    const outlet = await newOutlet();
    const tables = await newTables(outlet.id, 4, () => null);
    const signed = generateQrToken("TABLE", tables[0].id);
    await testDb.outletTable.update({ where: { id: tables[0].id }, data: { qrToken: signed } });
    await testDb.outletTable.update({ where: { id: tables[1].id }, data: { qrToken: "yer-tutucu-1" } });
    await testDb.outletTable.update({ where: { id: tables[2].id }, data: { qrToken: "yer-tutucu-2" } });
    const result = await tableQr.regenerateAll(ctx, outlet.id, { onlyUnsigned: true });
    expect(result).toEqual({ count: 3 });
    const after = await testDb.outletTable.findMany({ where: { outletId: outlet.id }, orderBy: { label: "asc" } });
    expect(after[0].qrToken).toBe(signed);
    for (const t of after) expect(verifyQrToken(t.qrToken!, "TABLE", t.id)).toBe(true);
    expect(await testDb.auditLog.count({ where: { action: "TABLE_QR_REGENERATE_ALL" } })).toBe(1);
  });

  it("onlyUnsigned verilmezse hepsini yeniler", async () => {
    const ctx = await fbm();
    const outlet = await newOutlet();
    const tables = await newTables(outlet.id, 3, () => null);
    const signed = generateQrToken("TABLE", tables[0].id);
    await testDb.outletTable.update({ where: { id: tables[0].id }, data: { qrToken: signed } });
    expect(await tableQr.regenerateAll(ctx, outlet.id, {})).toEqual({ count: 3 });
    expect((await testDb.outletTable.findUniqueOrThrow({ where: { id: tables[0].id } })).qrToken).not.toBe(signed);
  });
});

describe("tableQr.list", () => {
  it("etiket sırası doğal, signed ve atanmış garson", async () => {
    const ctx = await fbm();
    const outlet = await newOutlet();
    const tables = await newTables(outlet.id, 10, () => null);
    await tableQr.regenerate(ctx, tables[1].id);
    const waiter = await makeUser({ username: "gar", roleCode: "R-GAR", hotelCode: "MR" });
    await testDb.tableAssignment.create({
      data: { outletId: outlet.id, tableId: tables[1].id, userId: waiter.id },
    });
    const rows = await tableQr.list(ctx, outlet.id);
    expect(rows.map((r) => r.label)).toEqual(["M1", "M2", "M3", "M4", "M5", "M6", "M7", "M8", "M9", "M10"]);
    expect(rows[1]).toMatchObject({ signed: true, assignedWaiter: { id: waiter.id, fullName: waiter.fullName } });
    expect(rows[1].url).toMatch(/\/q\/[A-Za-z0-9_-]{30}$/);
    expect(rows[0]).toMatchObject({ signed: false, url: "" });
    expect(isSignedToken(rows[1].url.split("/q/")[1])).toBe(true);
  });
});

describe("indirme route'ları", () => {
  it("SVG: 200 image/svg+xml ve ASCII dosya adı", async () => {
    const ctx = await fbm();
    requireUser.mockResolvedValue(ctx);
    const outlet = await newOutlet("Havuz Bar");
    const [table] = await newTables(outlet.id, 1, () => null);
    await tableQr.regenerate(ctx, table.id);
    const res = await tableRoute.GET(
      new Request(`http://localhost/api/qr/table/${table.id}?format=svg`),
      params({ tableId: table.id }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("image/svg+xml");
    expect(res.headers.get("content-disposition")).toContain('filename="MR_Havuz_Bar_M1_QR.svg"');
    expect(await res.text()).toContain("<svg");
  });

  it("Türkçe karakterler ASCII'ye çevrilir; PNG imzası", async () => {
    const ctx = await fbm();
    requireUser.mockResolvedValue(ctx);
    const outlet = await newOutlet("Çay Bahçesi İç");
    const [table] = await newTables(outlet.id, 1, () => null);
    await tableQr.regenerate(ctx, table.id);
    const res = await tableRoute.GET(
      new Request(`http://localhost/api/qr/table/${table.id}?format=png`),
      params({ tableId: table.id }),
    );
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("content-disposition")).toContain('filename="MR_Cay_Bahcesi_Ic_M1_QR.png"');
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect(Array.from(bytes.slice(1, 4))).toEqual([0x50, 0x4e, 0x47]);
  });

  it("oturum yoksa 401; geçersiz format 400", async () => {
    const { DomainError } = await import("@/lib/result");
    requireUser.mockRejectedValueOnce(new DomainError("UNAUTHORIZED", "Oturum bulunamadı"));
    const res = await tableRoute.GET(new Request("http://localhost/api/qr/table/x"), params({ tableId: "x" }));
    expect(res.status).toBe(401);
    requireUser.mockResolvedValue(await fbm());
    const bad = await tableRoute.GET(
      new Request("http://localhost/api/qr/table/x?format=gif"),
      params({ tableId: "x" }),
    );
    expect(bad.status).toBe(400);
  });

  it("ZIP: M1.svg..M5.svg ve etiketler.csv", async () => {
    const ctx = await fbm();
    requireUser.mockResolvedValue(ctx);
    const outlet = await newOutlet();
    await newTables(outlet.id, 5, () => null);
    await tableQr.regenerateAll(ctx, outlet.id, {});
    const res = await zipRoute.GET(
      new Request(`http://localhost/api/qr/outlet/${outlet.id}/zip`),
      params({ outletId: outlet.id }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/zip");
    expect(res.headers.get("content-disposition")).toContain("MR_Havuz_Bar_QR.zip");
    const files = unzipSync(new Uint8Array(await res.arrayBuffer()));
    expect(Object.keys(files).sort()).toEqual(
      ["M1.svg", "M2.svg", "M3.svg", "M4.svg", "M5.svg", "etiketler.csv"].sort(),
    );
    const csv = new TextDecoder().decode(files["etiketler.csv"]);
    expect(csv.split("\n")[0]).toBe("etiket,url");
    expect(csv.trim().split("\n")).toHaveLength(6);
    expect(new TextDecoder().decode(files["M1.svg"])).toContain("<svg");
  });

  it("yazdırma şablonu: her masa için kart, outlet adı ve etiket", async () => {
    const ctx = await fbm();
    requireUser.mockResolvedValue(ctx);
    const outlet = await newOutlet();
    await newTables(outlet.id, 3, () => null);
    await tableQr.regenerateAll(ctx, outlet.id, {});
    const res = await printRoute.GET(
      new Request(`http://localhost/api/qr/outlet/${outlet.id}/print`),
      params({ outletId: outlet.id }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    const html = await res.text();
    expect(html.match(/class="card"/g)).toHaveLength(3);
    expect(html).toContain("Havuz Bar");
    expect(html).toContain("@media print");
  });
});

describe("csvCell ve etiketler.csv", () => {
  it("formül başlangıçlı hücreler tek tırnakla önlenir, CR içerenler tırnaklanır", () => {
    expect(tableQr.csvCell("=1+1")).toBe("'=1+1");
    expect(tableQr.csvCell("+90")).toBe("'+90");
    expect(tableQr.csvCell("-x")).toBe("'-x");
    expect(tableQr.csvCell("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(tableQr.csvCell("\tx")).toBe("'\tx");
    expect(tableQr.csvCell("\rx")).toBe('"\'\rx"');
    expect(tableQr.csvCell("a\rb")).toBe('"a\rb"');
    expect(tableQr.csvCell('a,"b"')).toBe('"a,""b"""');
    expect(tableQr.csvCell("M1")).toBe("M1");
  });

  it("ZIP içindeki etiketler.csv UTF-8 BOM ile başlar ve formül etiketini korur", async () => {
    const ctx = await fbm();
    const outlet = await newOutlet();
    await testDb.outletTable.create({ data: { outletId: outlet.id, label: "=cmd|x", qrToken: null } });
    await tableQr.regenerateAll(ctx, outlet.id, {});
    const zip = await tableQr.outletZip(ctx, outlet.id);
    const csv = unzipSync(zip.body)["etiketler.csv"];
    expect(Array.from(csv.slice(0, 3))).toEqual([0xef, 0xbb, 0xbf]);
    expect(new TextDecoder().decode(csv)).toContain("\n'=cmd|x,");
  });
});

describe("masa varlık oracle'ı yok", () => {
  it("R-FBM: başka otelin masası ile var olmayan id aynı hata kodunu alır", async () => {
    const ctx = await fbm(); // MR
    const other = await testDb.outlet.create({
      data: { hotelId: await hotelId("MRP"), name: "Başka Bar", type: "BAR", hasMenu: true },
    });
    const [foreign] = await newTables(other.id, 1);
    const codes: string[] = [];
    for (const id of [foreign.id, "yok-boyle-bir-masa"]) {
      for (const call of [() => tableQr.regenerate(ctx, id), () => tableQr.download(ctx, id, "svg")]) {
        codes.push(await call().then(() => "OK", (e: { code?: string }) => e.code ?? "?"));
      }
    }
    expect(new Set(codes).size).toBe(1);
    expect(codes[0]).not.toBe("OK");
  });
});
