import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { testDb } from "../helpers/db";
import {
  dropReferenceData,
  hotelId,
  makeUser,
  resetReferenceData,
  resetTestData,
} from "../helpers/fixtures";

vi.mock("@/lib/prisma", async () => ({ prisma: (await import("../helpers/db")).testDb }));

const { createSession } = await import("@/modules/core/server/sessions");
const { sweepSessions } = await import("@/modules/core/server/sessionSweeper");

const MIN = 60_000;
const NOW = new Date("2026-06-15T12:00:00.000Z");
const at = (minutes: number) => new Date(NOW.getTime() + minutes * MIN);

let seq = 0;
async function openSession(patch: {
  expiresAt?: Date;
  lastSeenAt?: Date;
  warnedAt?: Date | null;
  status?: "ONLINE" | "UYARI";
}) {
  const user = await makeUser({ username: `sw${++seq}`, roleCode: "R-GAR", hotelCode: "MR" });
  const session = await createSession({
    userId: user.id,
    hotelId: await hotelId("MR"),
    roleId: user.roleId,
  });
  return testDb.userSession.update({
    where: { id: session.id },
    data: { expiresAt: at(300), lastSeenAt: NOW, ...patch },
  });
}

const reload = (id: string) => testDb.userSession.findUniqueOrThrow({ where: { id } });
const events = async (id: string) =>
  (await testDb.sessionEvent.findMany({ where: { sessionId: id }, orderBy: { createdAt: "asc" } }))
    .map((e) => e.event);

const notifier = vi.fn<(userId: string, title: string, body: string) => Promise<void>>();
const deps = () => ({ warnMinutes: 60, idleMinutes: 45, notifier });

beforeAll(resetReferenceData);
beforeEach(async () => {
  await resetTestData();
  notifier.mockReset();
  notifier.mockResolvedValue(undefined);
});
afterAll(async () => {
  await dropReferenceData();
  await testDb.$disconnect();
});

describe("sweepSessions (gerçek test DB)", () => {
  it("bitişe 59 dk kalan oturumu UYARI yapar, warnedAt yazar, WARN olayı ve tek bildirim üretir", async () => {
    const s = await openSession({ expiresAt: at(59) });

    const result = await sweepSessions(NOW, deps());

    expect(result).toEqual({ warned: 1, expired: 0, idle: 0 });
    const after = await reload(s.id);
    expect(after.status).toBe("UYARI");
    expect(after.warnedAt?.getTime()).toBe(NOW.getTime());
    expect(await events(s.id)).toEqual(["LOGIN", "WARN"]);
    expect(notifier).toHaveBeenCalledTimes(1);
    expect(notifier).toHaveBeenCalledWith(
      s.userId,
      "Oturum süreniz bitiyor",
      "Oturumunuz 59 dakika içinde kapanacak",
    );
  });

  it("kalan süre yukarı yuvarlanır (58 dk 30 sn -> 59 dakika)", async () => {
    const s = await openSession({ expiresAt: new Date(NOW.getTime() + 58.5 * MIN) });
    await sweepSessions(NOW, deps());
    expect(notifier).toHaveBeenCalledWith(s.userId, expect.any(String), "Oturumunuz 59 dakika içinde kapanacak");
  });

  it("aynı oturum ikinci sweep'te tekrar uyarılmaz", async () => {
    const s = await openSession({ expiresAt: at(59) });
    await sweepSessions(NOW, deps());
    notifier.mockClear();

    const second = await sweepSessions(at(1), deps());

    expect(second).toEqual({ warned: 0, expired: 0, idle: 0 });
    expect(notifier).not.toHaveBeenCalled();
    expect(await events(s.id)).toEqual(["LOGIN", "WARN"]);
  });

  it("eşiğin dışındaki (61 dk kalan) oturum dokunulmaz", async () => {
    const s = await openSession({ expiresAt: at(61) });
    const result = await sweepSessions(NOW, deps());
    expect(result).toEqual({ warned: 0, expired: 0, idle: 0 });
    const after = await reload(s.id);
    expect(after.status).toBe("ONLINE");
    expect(after.warnedAt).toBeNull();
  });

  it("expiresAt geçmiş oturum CIKTI/SURE_ASIMI olur (uyarılmış olsa da)", async () => {
    const online = await openSession({ expiresAt: at(-1) });
    const warned = await openSession({ expiresAt: at(-5), status: "UYARI", warnedAt: at(-60) });

    const result = await sweepSessions(NOW, deps());

    expect(result).toEqual({ warned: 0, expired: 2, idle: 0 });
    for (const id of [online.id, warned.id]) {
      const after = await reload(id);
      expect(after.status).toBe("CIKTI");
      expect(after.logoutReason).toBe("SURE_ASIMI");
    }
    expect(notifier).not.toHaveBeenCalled();
  });

  it("46 dk hareketsiz oturum CIKTI/HAREKETSIZLIK olur", async () => {
    const s = await openSession({ lastSeenAt: at(-46) });
    const result = await sweepSessions(NOW, deps());
    expect(result).toEqual({ warned: 0, expired: 0, idle: 1 });
    const after = await reload(s.id);
    expect(after.status).toBe("CIKTI");
    expect(after.logoutReason).toBe("HAREKETSIZLIK");
  });

  it("44 dk hareketsiz oturum dokunulmaz", async () => {
    const s = await openSession({ lastSeenAt: at(-44) });
    const result = await sweepSessions(NOW, deps());
    expect(result).toEqual({ warned: 0, expired: 0, idle: 0 });
    expect((await reload(s.id)).status).toBe("ONLINE");
  });

  it("hem süresi dolmuş hem hareketsiz oturum yalnızca expired sayılır (SURE_ASIMI)", async () => {
    const s = await openSession({ expiresAt: at(-1), lastSeenAt: at(-90) });
    const result = await sweepSessions(NOW, deps());
    expect(result).toEqual({ warned: 0, expired: 1, idle: 0 });
    expect((await reload(s.id)).logoutReason).toBe("SURE_ASIMI");
  });

  it("bitişe yakın ve hareketsiz oturum uyarılmadan HAREKETSIZLIK ile kapanır", async () => {
    const s = await openSession({ expiresAt: at(30), lastSeenAt: at(-50) });
    const result = await sweepSessions(NOW, deps());
    expect(result).toEqual({ warned: 0, expired: 0, idle: 1 });
    expect((await reload(s.id)).logoutReason).toBe("HAREKETSIZLIK");
    expect(notifier).not.toHaveBeenCalled();
  });

  it("karışık durumda sayılar doğrudur; kapalı oturumlar yok sayılır", async () => {
    await openSession({ expiresAt: at(30) }); // warn
    await openSession({ expiresAt: at(10) }); // warn
    await openSession({ expiresAt: at(-3) }); // expired
    await openSession({ lastSeenAt: at(-60) }); // idle
    await openSession({}); // untouched
    const closed = await openSession({ expiresAt: at(-3) });
    await testDb.userSession.update({ where: { id: closed.id }, data: { status: "CIKTI" } });

    const result = await sweepSessions(NOW, deps());

    expect(result).toEqual({ warned: 2, expired: 1, idle: 1 });
    expect(notifier).toHaveBeenCalledTimes(2);
  });

  it("bildirici hata verirse oturum yine UYARI kalır ve sweep devam eder", async () => {
    const warnedSession = await openSession({ expiresAt: at(20) });
    const expired = await openSession({ expiresAt: at(-1) });
    notifier.mockRejectedValueOnce(new Error("push down"));
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await sweepSessions(NOW, deps());

    expect(result).toEqual({ warned: 1, expired: 1, idle: 0 });
    expect((await reload(expired.id)).status).toBe("CIKTI");
    expect((await reload(warnedSession.id)).status).toBe("UYARI");
    expect(errorLog).toHaveBeenCalledTimes(1);
    errorLog.mockRestore();
  });
});
