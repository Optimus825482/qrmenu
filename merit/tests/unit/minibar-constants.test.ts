import { describe, expect, it } from "vitest";
import { GuestRecordKind, TaskType } from "@/generated/prisma/client";
import { EVENT_TYPE_RE, SSE_EVENT_TYPES } from "@/lib/realtime-events";
import {
  ARRIVAL_LEAD_MINUTES,
  CLASH_CRITICAL_MINUTES,
  DEFAULT_ARRIVAL_TIME,
  DEFAULT_DEPARTURE_TIME,
  DEPARTURE_LAG_MINUTES,
  DND_MIN_GAP_SECONDS,
  KIND_LABEL_TR,
  OCCUPANCY_MAX_BYTES,
  QTY_BUTTON_MAX,
  TASK_TYPE_FOR_KIND,
  UPLOAD_KINDS,
} from "@/modules/minibar/constants";
import { MINIBAR_EVENTS } from "@/modules/minibar/events";

describe("minibar sabitleri", () => {
  it("UPLOAD_KINDS, GuestRecordKind enum değerleriyle aynıdır", () => {
    expect([...UPLOAD_KINDS].sort()).toEqual(Object.values(GuestRecordKind).sort());
  });

  it("her tür için görev tipi ve Türkçe etiket vardır", () => {
    for (const kind of UPLOAD_KINDS) {
      expect(Object.values(TaskType)).toContain(TASK_TYPE_FOR_KIND[kind]);
      expect(KIND_LABEL_TR[kind].length).toBeGreaterThan(0);
    }
    expect(KIND_LABEL_TR).toEqual({ IN_HOUSE: "In House", ARRIVAL: "Arrivals", DEPARTURE: "Departures" });
  });

  it("sayısal sabitler plan değerleridir", () => {
    expect(DND_MIN_GAP_SECONDS).toBe(30);
    expect(CLASH_CRITICAL_MINUTES).toBe(180);
    expect(ARRIVAL_LEAD_MINUTES).toBe(15);
    expect(DEPARTURE_LAG_MINUTES).toBe(60);
    expect(DEFAULT_DEPARTURE_TIME).toBe("12:00");
    expect(DEFAULT_ARRIVAL_TIME).toBe("14:00");
    expect(OCCUPANCY_MAX_BYTES).toBe(10 * 1024 * 1024);
    expect(QTY_BUTTON_MAX).toBe(4);
  });
});

describe("minibar olay tipleri", () => {
  it("SSE_EVENT_TYPES MINIBAR_EVENTS değerlerini içerir (roomcheck.done hariç) ve hepsi geçerli ad biçimindedir", () => {
    expect(MINIBAR_EVENTS.length).toBe(new Set(MINIBAR_EVENTS).size);
    for (const type of MINIBAR_EVENTS) {
      // roomcheck.done is deliberately subscribed to by the radar only (pinned by radar-normalize.test.ts).
      if (type !== "roomcheck.done") expect(SSE_EVENT_TYPES).toContain(type);
      expect(type).toMatch(EVENT_TYPE_RE);
    }
  });

  it("radar katalogundaki minibar olayları vardır", () => {
    for (const t of ["stock.changed", "stock.critical", "roomcheck.done", "dnd.marked", "dnd.completed", "dnd.reminder", "dnd.missed", "occupancy.uploaded", "stockrequest.created", "stockrequest.updated", "task.generated", "task.updated"]) {
      expect(MINIBAR_EVENTS).toContain(t);
    }
  });
});
