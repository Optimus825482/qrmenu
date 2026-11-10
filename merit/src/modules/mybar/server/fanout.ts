import type { Prisma } from "@/generated/prisma/client";
import { notify } from "@/modules/core/server/notifications";
import { MYBAR_NOTIFY_ROLES } from "../constants";

const NOTE_PREVIEW = 150;

export async function notifyNewRequest(
  tx: Prisma.TransactionClient,
  req: {
    id: string;
    hotelId: string;
    roomNumber: string;
    floorName: string;
    items: { name: string; qty: number }[];
    noteTr?: string | null;
    note?: string | null;
  },
): Promise<number> {
  const parts = [`${req.floorName} - Oda ${req.roomNumber} misafiri MyBar talebi gönderdi.`];
  if (req.items.length > 0) parts.push(`Ürünler: ${req.items.map((i) => `${i.name} ×${i.qty}`).join(", ")}.`);
  const note = (req.noteTr ?? req.note ?? "").trim();
  if (note) parts.push(`Not: ${note.slice(0, NOTE_PREVIEW)}`);
  return notify(
    {
      recipients: { hotelId: req.hotelId, roleCodes: [...MYBAR_NOTIFY_ROLES] },
      type: "mybar.created",
      fallbackHotelId: req.hotelId,
      refType: "MybarRequest",
      refId: req.id,
      title: `Oda ${req.roomNumber} - Yeni MyBar talebi`,
      body: parts.join(" "),
    },
    tx,
  );
}
