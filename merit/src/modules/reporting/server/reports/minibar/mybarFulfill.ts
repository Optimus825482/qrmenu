import { prisma } from "@/lib/prisma";

/** Stock movements booked by the MyBar flow: a pool take (qty < 0) is an addition, a "MyBar talebi iadesi" IADE a removal. */
const CANCEL_NOTE = "MyBar talebi iptal edildi";

export type MybarMove = {
  requestId: string;
  productId: string;
  kind: "added" | "removed";
  userName: string;
  at: Date;
};

/** The fulfilment movements of the given requests (cancel write-backs are not fulfilment), oldest first. */
export async function loadMybarMoves(requestIds: string[]): Promise<MybarMove[]> {
  if (requestIds.length === 0) return [];
  const rows = await prisma.hotelStockMovement.findMany({
    where: { refType: "MybarRequest", refId: { in: requestIds } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { refId: true, productId: true, qty: true, note: true, createdAt: true, user: { select: { fullName: true } } },
  });
  return rows
    .filter((m) => m.refId && m.note !== CANCEL_NOTE)
    .map((m) => ({
      requestId: m.refId!,
      productId: m.productId,
      kind: m.qty < 0 ? ("added" as const) : ("removed" as const),
      userName: m.user.fullName,
      at: m.createdAt,
    }));
}

/** Distinct fulfilling users per request, in the order they first acted. */
export async function loadFulfillers(requestIds: string[]): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  for (const m of await loadMybarMoves(requestIds)) {
    const list = out.get(m.requestId) ?? [];
    if (!list.includes(m.userName)) list.push(m.userName);
    out.set(m.requestId, list);
  }
  return out;
}

/** "Kola 2/3, Su 1/1" (done / wanted); null for an empty list. */
export function listLabel(lines: { name: string; done: number; wanted: number }[]): string | null {
  return lines.length === 0 ? null : lines.map((l) => `${l.name} ${l.done}/${l.wanted}`).join(", ");
}
