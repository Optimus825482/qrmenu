import { z } from "zod";
import { assertCan } from "@/lib/rbac";
import {
  auditCtxOf,
  canSeePrices,
  handle,
  maskPrices,
  parseBody,
} from "@/modules/minibar/server/apiAuthHelper";
import {
  addOrUpdateSetupItem,
  deleteSetupItem,
  listSetupItems,
} from "@/modules/minibar/server/minibarDefinitionsService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  setupId: z.string().min(1).max(64),
  productId: z.string().min(1).max(64),
  qty: z.number().int().min(1, "Setup norm miktarı 1 veya daha büyük olmalıdır.").max(999),
});

export async function GET(req: Request) {
  return handle(async (ctx) => {
    await assertCan(ctx, "MB-TAN", "V", ctx.session.hotelId);
    const setupId = new URL(req.url).searchParams.get("setupId");
    if (!setupId) return Response.json({ error: "Setup ID zorunludur." }, { status: 400 });
    return maskPrices({ items: await listSetupItems(setupId) }, canSeePrices(ctx));
  });
}

export async function POST(req: Request) {
  return handle(async (ctx) => {
    await assertCan(ctx, "MB-TAN", "O", ctx.session.hotelId);
    const item = await addOrUpdateSetupItem(await parseBody(req, bodySchema), auditCtxOf(ctx, req));
    return { success: true, item };
  });
}

export async function DELETE(req: Request) {
  return handle(async (ctx) => {
    await assertCan(ctx, "MB-TAN", "D", ctx.session.hotelId);
    const id = new URL(req.url).searchParams.get("id");
    if (!id) return Response.json({ error: "Setup öğe ID zorunludur." }, { status: 400 });
    return deleteSetupItem(id, auditCtxOf(ctx, req));
  });
}
