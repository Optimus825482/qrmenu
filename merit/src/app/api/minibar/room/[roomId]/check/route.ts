import { randomUUID } from "node:crypto";
import { z } from "zod";
import { handle, parseBody } from "@/modules/minibar/server/apiAuthHelper";
import { addReplacement, firstSetupOf, recordNoConsumption } from "@/modules/minibar/server/roomCheckService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  items: z
    .array(
      z.object({
        productId: z.string().min(1).max(64),
        setupId: z.string().min(1).max(64),
        qty: z.number().int().min(1).max(999),
      }),
    )
    .max(50)
    .optional(),
  /**
   * Deprecated shape of the pre-redesign room check page (UX T8 replaces it): quantities without a mandatory
   * setupId; an empty list meant "Sarfiyat Yok". Mapped onto `addReplacement` / `recordNoConsumption`.
   */
  consumedItems: z
    .array(
      z.object({
        productId: z.string().min(1).max(64),
        qty: z.number().int().min(0).max(999),
        setupId: z.string().min(1).max(64).optional(),
      }),
    )
    .max(200)
    .optional(),
  note: z.string().max(300).optional(),
  clientRequestId: z.uuid().optional(),
});

/** +N replacement (several lines, one atomic call). */
export async function POST(request: Request, props: { params: Promise<{ roomId: string }> }) {
  return handle(async (ctx) => {
    const { roomId } = await props.params;
    const body = await parseBody(request, bodySchema);
    const clientRequestId = body.clientRequestId ?? randomUUID();

    if (body.items) return addReplacement(ctx, { roomId, items: body.items, clientRequestId, note: body.note });

    const legacy = (body.consumedItems ?? []).filter((i) => i.qty > 0);
    if (legacy.length === 0) {
      const note = body.note?.trim();
      const r = await recordNoConsumption(ctx, { roomId, clientRequestId, ...(note ? { note } : {}) });
      return { success: true, ...r, replenishedCount: 0 };
    }
    const fallback = await firstSetupOf(
      ctx,
      roomId,
      legacy.map((i) => i.productId),
    );
    const items = legacy.map((i) => ({ productId: i.productId, qty: i.qty, setupId: i.setupId ?? fallback.get(i.productId) ?? "" }));
    const r = await addReplacement(ctx, { roomId, items, clientRequestId, note: body.note });
    return { success: true, ...r, replenishedCount: r.added };
  });
}
