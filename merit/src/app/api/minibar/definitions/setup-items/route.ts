import { z } from "zod";
import { canSeePrices, handle, maskPrices, parseBody } from "@/modules/minibar/server/apiAuthHelper";
import { addItem, get, removeItem, updateItem } from "@/modules/minibar/server/setups";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const addSchema = z.object({ setupId: z.string().min(1).max(64), productId: z.string().max(64), qty: z.number() });
const updateSchema = z.object({ id: z.string().min(1).max(64), qty: z.number() });

/** Item shape the definitions window reads (numeric price). */
const legacyShape = <T extends { salePrice: string | null }>(i: T) => ({
  ...i,
  salePrice: i.salePrice === null ? 0 : Number(i.salePrice),
});

export async function GET(req: Request) {
  return handle(async (ctx) => {
    const setupId = new URL(req.url).searchParams.get("setupId");
    if (!setupId) return Response.json({ error: "Setup ID zorunludur." }, { status: 400 });
    const setup = await get(ctx, setupId);
    return maskPrices({ items: setup.items.map((i) => ({ ...legacyShape(i), setupId })) }, canSeePrices(ctx));
  });
}

export async function POST(req: Request) {
  return handle(async (ctx) => {
    const { setupId, ...data } = await parseBody(req, addSchema);
    const item = await addItem(ctx, setupId, data);
    return { success: true, item: legacyShape(item) };
  });
}

/** Changes the quantity of an existing item (adding the same product twice is a conflict). */
export async function PUT(req: Request) {
  return handle(async (ctx) => {
    const { id, qty } = await parseBody(req, updateSchema);
    const item = await updateItem(ctx, id, qty);
    return { success: true, item: legacyShape(item) };
  });
}

export async function DELETE(req: Request) {
  return handle(async (ctx) => {
    const id = new URL(req.url).searchParams.get("id");
    if (!id) return Response.json({ error: "Setup öğe ID zorunludur." }, { status: 400 });
    await removeItem(ctx, id);
    return { success: true, message: "Ürün setup içeriğinden kaldırıldı." };
  });
}
