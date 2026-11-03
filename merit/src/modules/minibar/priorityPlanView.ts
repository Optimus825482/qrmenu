import type { PriorityRoutePlan, PriorityTaskPlanItem } from "./server/minibarTypes";

/** `GET /api/minibar/priority-plan` as it arrives over JSON (Dates are ISO strings). */
export type PriorityPlanJson = {
  entries: {
    seq: number;
    itemId: string;
    roomId: string;
    roomNumber: string;
    floorNumber: number;
    rank: 1 | 2 | 3 | 4 | 5;
    targetAt?: string;
    remainingMin?: number;
    overdue: boolean;
    label: string;
    clash?: { departure: string; arrival: string; gapMin: number; critical: boolean };
  }[];
  floors: { floorNumber: number; name: string; count: number; critical: number; firstSeq: number }[];
  summary: { total: number; critical: number; normal: number; clashes: number };
  briefing: string[];
};

const URGENCY: Record<number, PriorityTaskPlanItem["urgencyType"]> = {
  1: "CLASH",
  2: "ARRIVAL",
  3: "DEPARTURE",
  4: "IN_HOUSE",
  5: "DND_RETRY",
};
const BADGE: Record<number, string> = { 1: "Çakışma", 2: "Giriş", 3: "Çıkış", 4: "In-House", 5: "DND" };

const hhmm = (iso: string): string =>
  new Date(iso).toLocaleTimeString("tr-TR", { timeZone: "Europe/Nicosia", hour: "2-digit", minute: "2-digit" });

/** Field-name adapter: the attendant screens keep their card layout on top of the ranked plan. */
export function toRoutePlan(plan: PriorityPlanJson): PriorityRoutePlan {
  const floorName = new Map(plan.floors.map((f) => [f.floorNumber, f.name]));
  const tasks: PriorityTaskPlanItem[] = plan.entries.map((e) => ({
    taskId: e.itemId,
    roomId: e.roomId,
    roomNumber: e.roomNumber,
    floorId: "",
    floorNumber: e.floorNumber,
    floorName: floorName.get(e.floorNumber) ?? `Kat ${e.floorNumber}`,
    priorityRank: e.rank,
    urgencyType: URGENCY[e.rank],
    urgencyBadge: e.rank === 1 && e.clash?.critical ? "Çakışma (Kritik)" : BADGE[e.rank],
    targetTime: e.targetAt ? hhmm(e.targetAt) : null,
    minutesRemaining: e.remainingMin ?? null,
    explanation: e.label,
    isCompleted: false,
  }));
  const first = tasks[0];
  return {
    summary: {
      total: plan.summary.total,
      critical: plan.summary.critical,
      normal: plan.summary.normal,
      clashCount: plan.summary.clashes,
    },
    recommendedStartFloor: first
      ? { floorNumber: first.floorNumber, floorName: first.floorName, firstRoomNumber: first.roomNumber, reason: first.explanation }
      : null,
    floorSequence: plan.floors.map((f) => ({
      floorNumber: f.floorNumber,
      floorName: f.name,
      taskCount: f.count,
      criticalCount: f.critical,
    })),
    tasks,
    briefing: plan.briefing.join(" "),
  };
}
