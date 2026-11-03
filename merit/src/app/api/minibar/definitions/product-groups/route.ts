import { z } from "zod";
import { canSeePrices, handle, maskPrices, parseBody } from "@/modules/minibar/server/apiAuthHelper";
import { create, listAll, remove, setActive, update } from "@/modules/minibar/server/productGroups";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const fieldsSchema = z.object({
  name: z.string().max(200).optional(),
  description: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
});
const createSchema = fieldsSchema.extend({ name: z.string().max(200) });
const updateSchema = fieldsSchema.extend({ id: z.string().min(1).max(64) });

export async function GET() {
  return handle(async (ctx) => {
    return maskPrices({ groups: await listAll(ctx) }, canSeePrices(ctx));
  });
}

export async function POST(req: Request) {
  return handle(async (ctx) => {
    const group = await create(ctx, await parseBody(req, createSchema));
    return { success: true, group };
  });
}

/** `{ id, isActive }` alone toggles activity; omitted fields keep their stored value. */
export async function PUT(req: Request) {
  return handle(async (ctx) => {
    const { id, ...data } = await parseBody(req, updateSchema);
    const group =
      data.isActive !== undefined && data.name === undefined && data.description === undefined
        ? await setActive(ctx, id, data.isActive)
        : await update(ctx, id, data);
    return { success: true, group };
  });
}

export async function DELETE(req: Request) {
  return handle(async (ctx) => {
    const id = new URL(req.url).searchParams.get("id");
    if (!id) return Response.json({ error: "Grup ID zorunludur." }, { status: 400 });
    await remove(ctx, id);
    return { success: true, message: "Ürün grubu silindi." };
  });
}
