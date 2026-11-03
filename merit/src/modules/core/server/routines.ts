import { formatInTimeZone } from "date-fns-tz";
import type { Ctx } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { visibleScreens } from "@/lib/rbac";
import { businessDate, businessDay, TZ } from "@/lib/time";
import { UPLOAD_KINDS } from "@/modules/minibar/constants";
import { taskSummary } from "@/modules/minibar/server/tasks";
import { ROUTINE_REFRESH_EVENTS } from "../routineEvents";
import { guardScreenOf, screenForPath } from "../screenPaths";
import { ROLE_ROUTINES, type RoleRoutine, type RoutineAuto } from "../screenGuide";
import { SCREENS } from "../screens";
import { readGuidePrefs } from "./guidePrefs";

export type AutoKind = RoutineAuto;
export { ROUTINE_REFRESH_EVENTS };

export type RoutineItemStatus = {
  id: string;
  label: string;
  screen: string;
  href: string;
  done: boolean;
  auto: boolean;
  /** Which automatic check decides `done` (client: which events to listen to). */
  kind?: AutoKind;
};

export type RoutineStatus = {
  routine: RoleRoutine;
  day: string;
  items: RoutineItemStatus[];
  doneCount: number;
  expanded: boolean;
};

/** Printer heartbeat is "online" while it reported OK at most this long ago (same rule as the cashier board). */
const PRINTER_ONLINE_MS = 90_000;

/** Hotel-scoped state check of one automatic routine item; `true` = the item is done. */
export async function evaluateAuto(kind: AutoKind, ctx: Ctx, now: Date = new Date()): Promise<boolean> {
  const hotelId = ctx.session.hotelId;
  const outletId = ctx.session.outletId;
  const day = businessDate(now);
  switch (kind) {
    case "uploadsDone": {
      const done = await prisma.uploadTask.count({
        where: {
          hotelId,
          date: businessDay(day),
          kind: { in: [...UPLOAD_KINDS] },
          status: "TAMAMLANDI",
          uploadId: { not: null },
        },
      });
      return done >= UPLOAD_KINDS.length;
    }
    case "tasksDone": {
      const summary = await taskSummary(prisma, hotelId, day);
      return summary.total > 0 && summary.waiting === 0;
    }
    case "mybarAllSeen":
      return (await prisma.mybarRequest.count({ where: { hotelId, status: "BEKLEMEDE", seenAt: null } })) === 0;
    case "dndOpenZero":
      return (await prisma.roomDnd.count({ where: { hotelId, date: businessDay(day), status: "AKTIF" } })) === 0;
    case "printerOk": {
      const printers = outletId
        ? await prisma.printer.findMany({
            where: { hotelId, isActive: true, defaultForOutlets: { some: { id: outletId } } },
            select: { lastSeenAt: true, lastStatus: true },
          })
        : await prisma.printer.findMany({
            where: { hotelId, isActive: true },
            select: { lastSeenAt: true, lastStatus: true },
          });
      if (printers.length === 0) return false;
      return printers.every(
        (p) => p.lastStatus === "OK" && p.lastSeenAt !== null && now.getTime() - p.lastSeenAt.getTime() <= PRINTER_ONLINE_MS,
      );
    }
    case "queueEmpty":
      return (
        (await prisma.order.count({
          where: { hotelId, status: "GONDERILDI", ...(outletId ? { outletId } : {}) },
        })) === 0
      );
  }
}

const SCREEN_BY_CODE = new Map(SCREENS.map((s) => [s.code, s]));

/** Path of a catalogue screen without its `#...` desktop hint (query filters stay). */
function hrefOf(code: string): string | undefined {
  const screen = SCREEN_BY_CODE.get(code);
  if (!screen) return undefined;
  const hash = screen.path.indexOf("#");
  return hash === -1 ? screen.path : screen.path.slice(0, hash);
}

function isExpanded(routine: RoleRoutine, now: Date): boolean {
  if (!routine.hours) return true;
  const hour = Number(formatInTimeZone(now, TZ, "H"));
  return hour >= routine.hours[0] && hour < routine.hours[1];
}

/**
 * The signed-in role's daily routines with live state. An item whose screen (or the screen guarding
 * its route) the user cannot view is dropped, so a card never links somewhere that would deny entry.
 * Manual ticks come from `prefs.guide.checklist[today]` only: yesterday's ticks are never read.
 */
export async function getRoutines(ctx: Ctx, now: Date = new Date()): Promise<RoutineStatus[]> {
  const mine = ROLE_ROUTINES.filter((r) => r.roleCode === ctx.user.roleCode);
  if (mine.length === 0) return [];
  const day = businessDate(now);
  const [visibleList, prefs] = await Promise.all([visibleScreens(ctx), readGuidePrefs(ctx.user.id)]);
  const visible = new Set(visibleList);
  const ticked = new Set(prefs.checklist[day] ?? []);

  const autoKinds = new Set<AutoKind>();
  for (const routine of mine) for (const item of routine.items) if (item.auto) autoKinds.add(item.auto);
  const autoState = new Map<AutoKind, boolean>();
  await Promise.all([...autoKinds].map(async (kind) => autoState.set(kind, await evaluateAuto(kind, ctx, now))));

  const result: RoutineStatus[] = [];
  for (const routine of mine) {
    const items: RoutineItemStatus[] = [];
    for (const item of routine.items) {
      const href = hrefOf(item.screen);
      const screen = SCREEN_BY_CODE.get(item.screen);
      if (!href || !screen || !visible.has(item.screen) || !visible.has(guardScreenOf(screen))) continue;
      const owner = screenForPath(href);
      if (owner && !visible.has(owner.code)) continue;
      const auto = item.auto !== undefined;
      items.push({
        id: item.id,
        label: item.label,
        screen: item.screen,
        href,
        auto,
        done: item.auto ? (autoState.get(item.auto) ?? false) : ticked.has(item.id),
        ...(item.auto ? { kind: item.auto } : {}),
      });
    }
    if (items.length === 0) continue;
    result.push({
      routine,
      day,
      items,
      doneCount: items.filter((i) => i.done).length,
      expanded: isExpanded(routine, now),
    });
  }
  return result;
}
