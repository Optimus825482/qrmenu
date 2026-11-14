import { describe, expect, it, vi } from "vitest";
import type { RadarAlert } from "@/modules/radar/types";
import { acquireWakeLock } from "@/modules/radar/ui/wakeLock";
import { createSoundGate, createWallController } from "@/modules/radar/ui/wall";

function critAlert(overrides: Partial<RadarAlert> = {}): RadarAlert {
  return {
    key: "a1",
    severity: "crit",
    kind: "CAGRI",
    hotelId: "h1",
    ref: { tableId: "t1", outletId: "o1" },
    text: "Masa M1 çağrı süresi aşıldı",
    since: new Date(0).toISOString(),
    count: 1,
    ...overrides,
  };
}

describe("wall: createWallController", () => {
  it("views ['genel','kat','masa'], rotateSeconds 20 -> t=0 genel, t=20 kat, t=40 masa, t=60 genel", () => {
    const wc = createWallController({ views: ["genel", "kat", "masa"], rotateSeconds: 20 });
    wc.tick(0);
    expect(wc.state(0)).toEqual({
      index: 0,
      view: "genel",
      secondsLeft: 20,
      paused: null,
      label: "1/3 · Genel Bakış · 20 sn",
    });

    wc.tick(10_000);
    expect(wc.state(10_000).secondsLeft).toBe(10);
    expect(wc.state(10_000).label).toBe("1/3 · Genel Bakış · 10 sn");

    wc.tick(20_000);
    expect(wc.state(20_000)).toEqual({
      index: 1,
      view: "kat",
      secondsLeft: 20,
      paused: null,
      label: "2/3 · Kat · 20 sn",
    });

    wc.tick(40_000);
    expect(wc.state(40_000).view).toBe("masa");
    expect(wc.state(40_000).index).toBe(2);

    wc.tick(60_000);
    expect(wc.state(60_000).view).toBe("genel");
    expect(wc.state(60_000).index).toBe(0);
  });

  it("critical() t=25'te -> anında masa görünümü, paused 'critical', t=84'te aynı, t=86'da kaldığı yerden (kat) sürer", () => {
    const wc = createWallController({ views: ["genel", "kat", "masa"], rotateSeconds: 20 });
    wc.tick(0);
    wc.tick(20_000); // kat (20s left)
    wc.tick(25_000); // kat (15s left)
    expect(wc.state(25_000).view).toBe("kat");

    wc.critical(critAlert(), 25_000);
    const s25 = wc.state(25_000);
    expect(s25.view).toBe("masa");
    expect(s25.paused).toBe("critical");
    expect(s25.focus).toEqual({ tableId: "t1", outletId: "o1" });

    wc.tick(84_000);
    expect(wc.state(84_000).view).toBe("masa");
    expect(wc.state(84_000).paused).toBe("critical");

    wc.tick(86_000);
    const s86 = wc.state(86_000);
    expect(s86.paused).toBeNull();
    expect(s86.view).toBe("kat");
  });

  it("interaction(t) -> 60 sn duraklama, label 'Dönüş duraklatıldı', iki duraklama üst üste uzar ama kısalmaz", () => {
    const wc = createWallController({ views: ["genel", "kat", "masa"], rotateSeconds: 20 });
    wc.tick(0);
    wc.interaction(5_000);
    const s5 = wc.state(5_000);
    expect(s5.paused).toBe("interaction");
    expect(s5.label).toContain("Dönüş duraklatıldı");

    // Second pause extends to 70_000
    wc.interaction(10_000);
    wc.tick(66_000);
    expect(wc.state(66_000).paused).toBe("interaction");

    wc.tick(71_000);
    expect(wc.state(71_000).paused).toBeNull();
    expect(wc.state(71_000).view).toBe("genel");
  });

  it("tek görünümde dönüş yok", () => {
    const wc = createWallController({ views: ["kat"], rotateSeconds: 20 });
    wc.tick(0);
    wc.tick(25_000);
    expect(wc.state(25_000).view).toBe("kat");
    expect(wc.state(25_000).index).toBe(0);
  });
});

describe("wall: createSoundGate", () => {
  it("ardışık iki Kritik 10 sn arayla -> 1 çalma, 31 sn arayla -> 2; enabled=false -> 0", () => {
    const gate = createSoundGate({ minGapMs: 30_000, enabled: true });
    expect(gate.shouldPlay(10_000)).toBe(true);
    expect(gate.shouldPlay(20_000)).toBe(false);
    expect(gate.shouldPlay(41_000)).toBe(true);

    const offGate = createSoundGate({ minGapMs: 30_000, enabled: false });
    expect(offGate.shouldPlay(10_000)).toBe(false);
  });
});

describe("wakeLock: acquireWakeLock", () => {
  it("sahte navigator.wakeLock.request çağrılır, visibilitychange ile yeniden alınır, request reddedilince fırlatmaz", async () => {
    const releaseMock = vi.fn(async () => undefined);
    const requestMock = vi.fn(async () => ({ release: releaseMock }));
    const listeners = new Map<string, () => void>();
    const fakeDoc = {
      visibilityState: "visible",
      addEventListener: (ev: string, cb: () => void) => {
        listeners.set(ev, cb);
      },
      removeEventListener: (ev: string) => {
        listeners.delete(ev);
      },
    } as unknown as Document;

    const handle = acquireWakeLock({ wakeLock: { request: requestMock } }, fakeDoc);
    await Promise.resolve();
    expect(requestMock).toHaveBeenCalledTimes(1);

    // Simulate visibilitychange when visible -> re-acquires
    listeners.get("visibilitychange")?.();
    await Promise.resolve();
    expect(requestMock).toHaveBeenCalledTimes(2);

    handle.release();
    await Promise.resolve();
    expect(releaseMock).toHaveBeenCalled();

    // Rejection does not throw
    const rejectingNav = {
      wakeLock: {
        request: vi.fn(async () => {
          throw new Error("WakeLock denied");
        }),
      },
    };
    expect(() => acquireWakeLock(rejectingNav, fakeDoc)).not.toThrow();
    await Promise.resolve();
  });
});

describe("wall: whole complex", () => {
  it("offers the overview and only the boards that stack per hotel", async () => {
    const { complexViews } = await import("@/modules/radar/ui/wall");
    expect(complexViews(new Set(["MINIBAR", "SIPARIS", "ODA_SERVISI", "PERSONEL", "SISTEM"]))).toEqual(["genel", "masa", "odaServisi", "mybar"]);
    expect(complexViews(new Set(["SIPARIS", "ODA_SERVISI"]))).toEqual(["genel", "masa", "odaServisi"]);
    expect(complexViews(new Set())).toEqual(["genel"]);
  });

  it("splits the lane cap between the stacked boards, never below one card", async () => {
    const { complexLaneCap } = await import("@/modules/radar/ui/wall");
    expect(complexLaneCap(6, 1)).toBe(6);
    expect(complexLaneCap(6, 3)).toBe(2);
    expect(complexLaneCap(6, 10)).toBe(1);
    expect(complexLaneCap(6, 0)).toBe(6);
  });

  it("a pinned single view of the complex never rotates away", () => {
    const wc = createWallController({ views: ["odaServisi"], rotateSeconds: 20 });
    wc.tick(0);
    expect(wc.state(500_000).view).toBe("odaServisi");
  });
});

describe("wall: reload after a release", () => {
  it("reloads once per new server build, never for its own build or an unknown one", async () => {
    const { wallShouldReload } = await import("@/modules/radar/ui/wallReload");
    expect(wallShouldReload({ clientBuildId: "a", serverBuildId: "a", reloadedFor: null })).toBe(false);
    expect(wallShouldReload({ clientBuildId: "a", serverBuildId: undefined, reloadedFor: null })).toBe(false);
    expect(wallShouldReload({ clientBuildId: "a", serverBuildId: "b", reloadedFor: null })).toBe(true);
    // Already reloaded for "b" and still on "a" (a stale cached page): no loop.
    expect(wallShouldReload({ clientBuildId: "a", serverBuildId: "b", reloadedFor: "b" })).toBe(false);
    expect(wallShouldReload({ clientBuildId: "a", serverBuildId: "c", reloadedFor: "b" })).toBe(true);
  });
});

describe("wall: configure", () => {
  it("keeps a running interaction pause when the rotation list changes (hotel switched by hand)", () => {
    const wc = createWallController({ views: ["genel", "kat"], rotateSeconds: 20 });
    wc.tick(0);
    wc.interaction(1_000);
    wc.configure({ views: ["genel"], rotateSeconds: 20 });
    expect(wc.state(2_000).paused).toBe("interaction");
    expect(wc.state(62_000).paused).toBeNull();
  });

  it("keeps the place in the rotation when the view on screen is still in the new list", () => {
    const wc = createWallController({ views: ["genel", "kat", "masa"], rotateSeconds: 20 });
    wc.tick(0);
    expect(wc.state(21_000).view).toBe("kat");
    wc.configure({ views: ["kat", "masa"], rotateSeconds: 20 });
    expect(wc.state(22_000).view).toBe("kat");
    wc.configure({ views: ["genel", "masa"], rotateSeconds: 20 });
    expect(wc.state(23_000).view).toBe("genel");
  });
});
