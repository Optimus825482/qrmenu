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
  createSetup,
  deleteSetup,
  listSetups,
  updateSetup,
} from "@/modules/minibar/server/minibarDefinitionsService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const createSchema = z.object({
  name: z.string().trim().min(1, "Setup adı zorunludur.").max(100),
  description: z.string().max(300).optional(),
  isInsideCabinet: z.boolean().optional(),
  isActive: z.boolean().optional(),
});
const updateSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().trim().min(1).max(100).optional(),
  description: z.string().max(300).nullable().optional(),
  isInsideCabinet: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

export async function GET() {
  return handle(async (ctx) => {
    await assertCan(ctx, "MB-TAN", "V", ctx.session.hotelId);
    return maskPrices({ setups: await listSetups() }, canSeePrices(ctx));
  });
}

export async function POST(req: Request) {
  return handle(async (ctx) => {
    await assertCan(ctx, "MB-TAN", "O", ctx.session.hotelId);
    const setup = await createSetup(await parseBody(req, createSchema), auditCtxOf(ctx, req));
    return { success: true, setup };
  });
}

export async function PUT(req: Request) {
  return handle(async (ctx) => {
    await assertCan(ctx, "MB-TAN", "D", ctx.session.hotelId);
    const { id, ...data } = await parseBody(req, updateSchema);
    const setup = await updateSetup(id, data, auditCtxOf(ctx, req));
    return { success: true, setup };
  });
}

export async function DELETE(req: Request) {
  return handle(async (ctx) => {
    await assertCan(ctx, "MB-TAN", "D", ctx.session.hotelId);
    const id = new URL(req.url).searchParams.get("id");
    if (!id) return Response.json({ error: "Setup ID zorunludur." }, { status: 400 });
    return deleteSetup(id, auditCtxOf(ctx, req));
  });
}
