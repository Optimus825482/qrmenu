import type { MybarStatus, Prisma } from "@/generated/prisma/client";
import { publish } from "@/lib/realtime";
import { publishRadar } from "@/modules/radar/publish";
import { MYBAR_EVENTS, MYBAR_EVENT_ROLE_KINDS } from "./constants";

export { MYBAR_EVENTS };
export type MybarEventType = (typeof MYBAR_EVENTS)[number];

/** Transactional publication: no lifecycle event escapes a rolled-back write. */
export function publishMybar(
  tx: Prisma.TransactionClient,
  type: MybarEventType,
  req: {
    hotelId: string;
    roomId: string;
    roomNumber: string;
    id: string;
    status: MybarStatus;
    byUserId?: string;
    closedWithMissing?: boolean;
    waitSec?: number;
  },
): Promise<void> {
  const base = { hotelId: req.hotelId, roomId: req.roomId };
  switch (type) {
    case "mybar.created":
      return publishRadar("mybar.created", base, { requestId: req.id, roomId: req.roomId, roomNumber: req.roomNumber }, tx);
    case "mybar.seen":
      return publishRadar("mybar.seen", base, { requestId: req.id, roomId: req.roomId, byUserId: req.byUserId ?? "" }, tx);
    case "mybar.completed":
      return publishRadar(
        "mybar.completed",
        base,
        {
          requestId: req.id,
          roomId: req.roomId,
          roomNumber: req.roomNumber,
          closedWithMissing: req.closedWithMissing === true,
          waitSec: Math.max(0, Math.floor(req.waitSec ?? 0)),
          byUserId: req.byUserId ?? "",
        },
        tx,
      );
    case "mybar.cancelled":
      // No user: the system cancelled it (guest checkout).
      return publishRadar(
        "mybar.cancelled",
        base,
        { requestId: req.id, roomId: req.roomId, ...(req.byUserId ? { byUserId: req.byUserId } : {}) },
        tx,
      );
    default:
      return publish(
        {
          type,
          hotelId: req.hotelId,
          roomId: req.roomId,
          roleKinds: MYBAR_EVENT_ROLE_KINDS,
          payload: {
            requestId: req.id,
            roomId: req.roomId,
            roomNumber: req.roomNumber,
            status: req.status,
            ...(req.byUserId ? { byUserId: req.byUserId } : {}),
            ...(req.closedWithMissing !== undefined ? { closedWithMissing: req.closedWithMissing } : {}),
            ...(req.waitSec !== undefined ? { waitSec: req.waitSec } : {}),
          },
        },
        tx,
      );
  }
}
