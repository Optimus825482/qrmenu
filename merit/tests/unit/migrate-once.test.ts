import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { MARKER_KEY, ONCE_ARGS, runOnce, type OnceDb } from "../../scripts/migrate-from-minibarlatest/once";

function fakeDb(opts: { lock?: boolean; marker?: boolean } = {}) {
  const calls: string[] = [];
  const db: OnceDb = {
    async query(sql) {
      calls.push(sql);
      if (sql.includes("pg_try_advisory_lock")) return { rows: [{ ok: opts.lock ?? true }] };
      if (sql.startsWith("SELECT")) return { rows: opts.marker ? [{ value: "2026-11-11T00:00:00.000Z" }] : [] };
      return { rows: [] };
    },
    async end() {
      calls.push("END");
    },
  };
  return { db, calls };
}

const ENV = { LEGACY_DATABASE_URL: "postgresql://x/eski", DATABASE_URL: "postgresql://x/yeni" };
const reportPath = path.join(os.tmpdir(), "migrate-once-test-yok.md");

function deps(db: OnceDb, code = 0) {
  const migrate = vi.fn(async () => code);
  return { d: { connect: async () => db, probeLegacy: async () => undefined, migrate, log: () => undefined, reportPath }, migrate };
}

describe("eski veri aktarımı: dağıtımda yalnız bir kez", () => {
  it("LEGACY_DATABASE_URL yoksa veritabanına bile bağlanmaz", async () => {
    const connect = vi.fn();
    const migrate = vi.fn();
    expect(await runOnce({ DATABASE_URL: "x" }, { connect, probeLegacy: async () => undefined, migrate, log: () => undefined, reportPath })).toBe("kapali");
    expect(connect).not.toHaveBeenCalled();
    expect(migrate).not.toHaveBeenCalled();
  });

  it("işaret varsa aktarımı çalıştırmaz", async () => {
    const { db, calls } = fakeDb({ marker: true });
    const { d, migrate } = deps(db);
    expect(await runOnce(ENV, d)).toBe("zaten-yapildi");
    expect(migrate).not.toHaveBeenCalled();
    expect(calls.at(-1)).toBe("END");
  });

  it("kilit başka kaptaysa çalıştırmaz", async () => {
    const { db } = fakeDb({ lock: false });
    const { d, migrate } = deps(db);
    expect(await runOnce(ENV, d)).toBe("kilitli");
    expect(migrate).not.toHaveBeenCalled();
  });

  it("temiz biterse sabit bayraklarla çalışır ve işareti yazar", async () => {
    const { db, calls } = fakeDb();
    const { d, migrate } = deps(db, 0);
    expect(await runOnce(ENV, d)).toBe("tamam");
    expect(migrate).toHaveBeenCalledWith([...ONCE_ARGS, "--report", reportPath], ENV);
    expect(ONCE_ARGS).toEqual(["--user-roles", "depo_sorumlusu", "--frozen-catalog"]);
    expect(calls.some((s) => s.includes('INSERT INTO "settings"'))).toBe(true);
    expect(MARKER_KEY).toBe("migration.legacy.completedAt");
  });

  it("eski veritabanına ulaşılamazsa aktarım başlamaz; localhost için açıklama yazar", async () => {
    const { db, calls } = fakeDb();
    const { d, migrate } = deps(db);
    const lines: string[] = [];
    const refused = new AggregateError([Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:5432"), { code: "ECONNREFUSED" })], "");
    const result = await runOnce(
      { ...ENV, LEGACY_DATABASE_URL: "postgresql://u:gizli@localhost:5432/minibar" },
      { ...d, probeLegacy: async () => Promise.reject(refused), log: (l) => lines.push(l) },
    );
    expect(result).toBe("basarisiz");
    expect(migrate).not.toHaveBeenCalled();
    expect(lines.join(" | ")).toContain("ECONNREFUSED");
    expect(lines.join(" | ")).toContain("sunucu: localhost");
    expect(lines.join(" | ")).not.toContain("gizli");
    expect(calls.some((s) => s.includes("INSERT"))).toBe(false);
  });

  it("hata olursa işaret yazılmaz (sonraki açılışta yeniden denenir)", async () => {
    const { db, calls } = fakeDb();
    const { d } = deps(db, 1);
    expect(await runOnce(ENV, d)).toBe("basarisiz");
    expect(calls.some((s) => s.includes("INSERT"))).toBe(false);
    expect(calls.at(-1)).toBe("END");
  });
});
