import { spawnSync } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { matchesScope, type Scope } from "@/lib/realtime";
import type { MeritEvent } from "@/lib/realtime-events";
import { toRadarEvent, type Wire } from "@/modules/radar/events";
import { H, T0, iso, makeSnapshot, wireOrder } from "../helpers/radarStateFixtures";
import { harness } from "../helpers/radarStoreHarness";

describe("radar yük ve sınır kanıtları (Task 12)", () => {
  it("345 Scope (40 personel + 5 radar izleyicisi + 300 misafir) × 600 olay matchesScope ≤ 200 ms", () => {
    const scopes: Scope[] = [];
    for (let i = 0; i < 40; i++) {
      scopes.push({
        userId: `staff-${i}`,
        sessionId: `sess-staff-${i}`,
        hotelIds: [H],
        outletId: `o${(i % 4) + 1}`,
        roleKind: i % 2 === 0 ? "OUTLET" : "MINIBAR",
      });
    }
    for (let i = 0; i < 5; i++) {
      scopes.push({
        userId: `radar-${i}`,
        sessionId: `sess-radar-${i}`,
        hotelIds: [H],
        roleKind: "YONETIM",
      });
    }
    for (let i = 0; i < 300; i++) {
      scopes.push({
        userId: `guest-${i}`,
        sessionId: `sess-guest-${i}`,
        hotelIds: [H],
        outletId: `o${(i % 4) + 1}`,
        roleKind: "OUTLET",
      });
    }
    expect(scopes).toHaveLength(345);

    const events: MeritEvent[] = [];
    for (let i = 0; i < 600; i++) {
      events.push(wireOrder(T0 + i * 100, `ord-${i}`, `t${(i % 30) + 1}`));
    }

    const runs: number[] = [];
    for (let r = 0; r < 3; r++) {
      const t0 = performance.now();
      let matched = 0;
      for (const e of events) {
        for (const s of scopes) {
          if (matchesScope(e, s)) matched++;
        }
      }
      expect(matched).toBeGreaterThan(0);
      runs.push(performance.now() - t0);
    }
    runs.sort((a, b) => a - b);
    expect(runs[0]).toBeLessThanOrEqual(200);
  });

  it("presence.tick parçası (40 oturum) ≤ 4 KB", () => {
    const payload: Wire["presence.tick"] = {
      sessions: Array.from({ length: 40 }, (_, i) => ({
        sessionId: `cm00000000000000000000${String(i).padStart(2, "0")}`,
        lastSeenAt: iso(T0 + i * 1000),
      })),
    };
    const event: MeritEvent = {
      type: "presence.tick",
      hotelId: H,
      roleKinds: ["SISTEM", "YONETIM"],
      at: iso(T0),
      payload,
    };
    const bytes = Buffer.byteLength(JSON.stringify(event), "utf8");
    expect(bytes).toBeLessThanOrEqual(4096);
  });

  it("toRadarEvent 600 olay ≤ 50 ms", () => {
    const events: MeritEvent[] = Array.from({ length: 600 }, (_, i) =>
      wireOrder(T0 + i * 100, `ord-${i}`, `t${(i % 30) + 1}`),
    );
    const runs: number[] = [];
    for (let r = 0; r < 3; r++) {
      const t0 = performance.now();
      let count = 0;
      for (const e of events) {
        if (toRadarEvent(e)) count++;
      }
      expect(count).toBe(600);
      runs.push(performance.now() - t0);
    }
    runs.sort((a, b) => a - b);
    expect(runs[0]).toBeLessThanOrEqual(50);
  });

  it("createRadarStore 5.000 olay besledikten sonra buffer.length ≤ 5000 ve checkpoints.size ≤ 30", async () => {
    const h = harness({ snapshot: () => makeSnapshot({ tables: 50, generatedAt: iso(T0) }) });
    await h.boot();
    for (let i = 0; i < 5_000; i++) {
      const at = T0 + 100 + i * 360; // ~30 minutes span across 5,000 events
      h.setNow(at);
      h.emit(
        wireOrder(
          at,
          `o-${i % 200}`,
          `t${(i % 50) + 1}`,
          "order.approved",
          i % 2 === 0 ? "ONAYLANDI" : "SERVIS_EDILDI",
        ),
      );
      if (i % 100 === 99) h.store.getState().flush();
    }
    h.store.getState().flush();
    const s = h.store.getState();
    expect(s.buffer.length).toBeLessThanOrEqual(5000);
    expect(s.checkpoints.size).toBeLessThanOrEqual(30);
  });

  it("radar-sim.ts NODE_ENV=production ile çalıştırıldığında çıkış kodu 1 ile reddedilir", () => {
    const scriptPath = path.resolve(process.cwd(), "scripts/radar-sim.ts");
    const res = spawnSync(
      process.execPath,
      ["--import", "tsx", scriptPath, "--hotel", "ROYAL", "--duration", "1"],
      {
        env: { ...process.env, NODE_ENV: "production" },
        encoding: "utf8",
      },
    );
    expect(res.status).toBe(1);
    expect(res.stderr).toContain("NODE_ENV=production");
  });
});
