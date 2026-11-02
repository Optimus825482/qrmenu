import { z } from "zod";
import { assertCan } from "@/lib/rbac";
import { auditCtxOf, handle, parseBody } from "@/modules/minibar/server/apiAuthHelper";
import {
  createProductGroup,
  deleteProductGroup,
  listProductGroups,
  updateProductGroup,
} from "@/modules/minibar/server/minibarDefinitionsService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const createSchema = z.object({
  name: z.string().trim().min(1, "Ürün grubu adı zorunludur.").max(100),
  description: z.string().max(300).optional(),
  isActive: z.boolean().optional(),
});
const updateSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().trim().min(1).max(100).optional(),
  description: z.string().max(300).nullable().optional(),
  isActive: z.boolean().optional(),
});

export async function GET() {
  return handle(async (ctx) => {
    await assertCan(ctx, "MB-TAN", "V", ctx.session.hotelId);
    return { groups: await listProductGroups() };
  });
}

export async function POST(req: Request) {
  return handle(async (ctx) => {
    await assertCan(ctx, "MB-TAN", "O", ctx.session.hotelId);
    const group = await createProductGroup(await parseBody(req, createSchema), auditCtxOf(ctx, req));
    return { success: true, group };
  });
}

export async function PUT(req: Request) {
  return handle(async (ctx) => {
    await assertCan(ctx, "MB-TAN", "D", ctx.session.hotelId);
    const { id, ...data } = await parseBody(req, updateSchema);
    const group = await updateProductGroup(id, data, auditCtxOf(ctx, req));
    return { success: true, group };
  });
}

export async function DELETE(req: Request) {
  return handle(async (ctx) => {
    await assertCan(ctx, "MB-TAN", "D", ctx.session.hotelId);
    const id = new URL(req.url).searchParams.get("id");
    if (!id) return Response.json({ error: "Grup ID zorunludur." }, { status: 400 });
    return deleteProductGroup(id, auditCtxOf(ctx, req));
  });
}
