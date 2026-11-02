// Client-safe constants of the live radar.
import type { RoleKind } from "@/generated/prisma/client";
import type { RadarLayer, WallView } from "./types";

export const RADAR_LAYERS: readonly RadarLayer[] = ["MINIBAR", "SIPARIS", "ODA_SERVISI", "PERSONEL", "SISTEM"];

export const WALL_VIEWS = ["genel", "kat", "masa", "kuyruk", "odaServisi", "personel"] as const satisfies readonly WallView[];

const MINIBAR_KINDS: RoleKind[] = ["SISTEM", "YONETIM", "MINIBAR"];

/**
 * Single source of the `roleKinds` envelope of every radar wire event (`null` = existing scope,
 * no role restriction). Publishers go through `publishRadar`; nobody writes `roleKinds` by hand.
 */
export const WIRE_ROLE_KINDS: Record<string, RoleKind[] | null> = {
  "roomcheck.done": MINIBAR_KINDS,
  "room.check.changed": MINIBAR_KINDS,
  "dnd.marked": MINIBAR_KINDS,
  "dnd.completed": MINIBAR_KINDS,
  "dnd.missed": MINIBAR_KINDS,
  "mybar.created": MINIBAR_KINDS,
  "mybar.seen": MINIBAR_KINDS,
  "mybar.completed": MINIBAR_KINDS,
  "mybar.cancelled": MINIBAR_KINDS,
  "task.updated": MINIBAR_KINDS,
  "task.generated": MINIBAR_KINDS,
  "stock.changed": MINIBAR_KINDS,
  "stock.critical": MINIBAR_KINDS,
  "occupancy.uploaded": MINIBAR_KINDS,
  "occupancy.missing": MINIBAR_KINDS,
  "scan.room": MINIBAR_KINDS,
  "presence.tick": ["SISTEM", "YONETIM"],
  "mail.failed": ["SISTEM"],
  "order.sla": null,
  "printer.status": null,
};

export const PULSE_MS = 600;
export const STORM_THRESHOLD = 20;
export const FLUSH_PER_SEC = 4;
export const BUFFER_MAX_EVENTS = 5000;

/** Audit actions of a changed/deleted room check (source of `room.check.changed`; Task 6). */
export const ROOM_CHECK_CHANGE_ACTIONS = ["MINIBAR_ROOM_CHECK_DELETE", "MINIBAR_ROOM_CHECK_UPDATE"] as const;
