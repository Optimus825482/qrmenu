import { z } from "zod";
import { canSeePrices, handle, maskPrices, parseBody, parseQuery } from "@/modules/minibar/server/apiAuthHelper";
import { create, listAll, type ProductRow, remove, setActive, update } from "@/modules/minibar/server/products";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const fieldsSchema = z.object({
  groupId: z.string().max(64).optional(),
  code: z.string().nullable().optional(),
  name: z.string().optional(),
  barcode: z.string().nullable().optional(),
  unit: z.string().optional(),
  criticalLevel: z.number().optional(),
  purchasePrice: z.number().nullable().optional(),
  salePrice: z.number().nullable().optional(),
  isActive: z.boolean().optional(),
});
const createSchema = fieldsSchema.extend({ groupId: z.string().max(64), name: z.string() });
const updateSchema = fieldsSchema.extend({ id: z.string().min(1).max(64) });
const querySchema = z.object({
  groupId: z.string().max(64).optional(),
  search: z.string().max(100).optional(),
  isActive: z.enum(["true", "false"]).optional(),
});

/** Row shape the definitions window reads: numeric prices and `setupItemCount`; the typed fields stay. */
function legacyShape(p: ProductRow) {
  return {
    ...p,
    purchasePrice: p.purchasePrice === null ? null : Number(p.purchasePrice),
    salePrice: p.salePrice === null ? null : Number(p.salePrice),
    setupItemCount: p.setupCount,
  };
}

export async function GET(req: Request) {
  return handle(async (ctx) => {
    const q = parseQuery(new URL(req.url).searchParams, querySchema);
    const products = await listAll(ctx, {
      groupId: q.groupId,
      q: q.search || undefined,
      active: q.isActive === undefined ? undefined : q.isActive === "true",
    });
    return maskPrices({ products: products.map(legacyShape) }, canSeePrices(ctx));
  });
}

export async function POST(req: Request) {
  return handle(async (ctx) => {
    const product = await create(ctx, await parseBody(req, createSchema));
    return maskPrices({ success: true, product: legacyShape(product) }, canSeePrices(ctx));
  });
}

/** `{ id, isActive }` alone toggles activity; any other field edits the product (omitted fields stay). */
export async function PUT(req: Request) {
  return handle(async (ctx) => {
    const { id, ...data } = await parseBody(req, updateSchema);
    const { isActive, ...others } = data;
    const onlyActive = isActive !== undefined && Object.values(others).every((v) => v === undefined);
    const product = onlyActive ? await setActive(ctx, id, isActive) : await update(ctx, id, data);
    return maskPrices({ success: true, product: legacyShape(product) }, canSeePrices(ctx));
  });
}

export async function DELETE(req: Request) {
  return handle(async (ctx) => {
    const id = new URL(req.url).searchParams.get("id");
    if (!id) return Response.json({ error: "Ürün ID zorunludur." }, { status: 400 });
    await remove(ctx, id);
    return { success: true, message: "Ürün silindi." };
  });
}
