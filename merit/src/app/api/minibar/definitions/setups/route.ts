import { z } from "zod";
import { canSeePrices, handle, maskPrices, parseBody } from "@/modules/minibar/server/apiAuthHelper";
import { create, get, listAll, remove, type SetupDetail, setActive, update } from "@/modules/minibar/server/setups";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const fieldsSchema = z.object({
  name: z.string().optional(),
  description: z.string().nullable().optional(),
  isInsideCabinet: z.boolean().optional(),
  isActive: z.boolean().optional(),
});
const createSchema = fieldsSchema.extend({ name: z.string() });
const updateSchema = fieldsSchema.extend({ id: z.string().min(1).max(64) });

/** Row shape the definitions window reads (numeric prices, counts, norm total). */
function legacyShape(s: SetupDetail) {
  return {
    ...s,
    roomTypeAssignmentCount: s.assignedRoomTypeCount,
    totalNormItems: s.items.reduce((sum, i) => sum + i.qty, 0),
    items: s.items.map((i) => ({ ...i, salePrice: i.salePrice === null ? 0 : Number(i.salePrice) })),
  };
}

export async function GET() {
  return handle(async (ctx) => {
    const setups = await listAll(ctx);
    return maskPrices({ setups: setups.map(legacyShape) }, canSeePrices(ctx));
  });
}

export async function POST(req: Request) {
  return handle(async (ctx) => {
    const setup = await create(ctx, await parseBody(req, createSchema));
    return { success: true, setup };
  });
}

/** `{ id, isActive }` alone toggles activity; otherwise omitted fields keep their stored value. */
export async function PUT(req: Request) {
  return handle(async (ctx) => {
    const { id, ...data } = await parseBody(req, updateSchema);
    const onlyActive =
      data.isActive !== undefined &&
      data.name === undefined &&
      data.description === undefined &&
      data.isInsideCabinet === undefined;
    if (onlyActive) return { success: true, setup: await setActive(ctx, id, data.isActive as boolean) };
    const existing = await get(ctx, id);
    const setup = await update(ctx, id, {
      name: data.name ?? existing.name,
      description: data.description === undefined ? existing.description : data.description,
      isInsideCabinet: data.isInsideCabinet ?? existing.isInsideCabinet,
      isActive: data.isActive,
    });
    return { success: true, setup };
  });
}

export async function DELETE(req: Request) {
  return handle(async (ctx) => {
    const id = new URL(req.url).searchParams.get("id");
    if (!id) return Response.json({ error: "Setup ID zorunludur." }, { status: 400 });
    await remove(ctx, id);
    return { success: true, message: "Setup silindi." };
  });
}
