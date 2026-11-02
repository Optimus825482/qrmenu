import { z } from "zod";
import { assertCan } from "@/lib/rbac";
import {
  assertCatalogWriter,
  auditCtxOf,
  canSeePrices,
  handle,
  maskPrices,
  parseBody,
  parseQuery,
} from "@/modules/minibar/server/apiAuthHelper";
import {
  createProduct,
  deleteProduct,
  listProducts,
  updateProduct,
} from "@/modules/minibar/server/minibarDefinitionsService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const price = z.number().min(0).max(1_000_000).nullable().optional();
const createSchema = z.object({
  groupId: z.string().min(1, "Ürün grubu seçilmelidir.").max(64),
  code: z.string().max(64).nullable().optional(),
  name: z.string().trim().min(1, "Ürün adı zorunludur.").max(150),
  barcode: z.string().max(64).nullable().optional(),
  unit: z.string().max(20).optional(),
  criticalLevel: z.number().int().min(0).max(100000).optional(),
  purchasePrice: price,
  salePrice: price,
  isActive: z.boolean().optional(),
});
const updateSchema = createSchema.partial().extend({ id: z.string().min(1).max(64) });
const querySchema = z.object({
  groupId: z.string().max(64).optional(),
  search: z.string().max(100).optional(),
  isActive: z.enum(["true", "false"]).optional(),
});

/** Prices are written by system and management roles only; for others the fields are dropped. */
function withoutPrices<T extends { purchasePrice?: unknown; salePrice?: unknown }>(data: T, allowed: boolean): T {
  if (allowed) return data;
  const copy = { ...data };
  delete copy.purchasePrice;
  delete copy.salePrice;
  return copy;
}

export async function GET(req: Request) {
  return handle(async (ctx) => {
    await assertCan(ctx, "MB-TAN", "V", ctx.session.hotelId);
    const q = parseQuery(new URL(req.url).searchParams, querySchema);
    const products = await listProducts({
      groupId: q.groupId,
      search: q.search,
      isActive: q.isActive === undefined ? undefined : q.isActive === "true",
    });
    return maskPrices({ products }, canSeePrices(ctx));
  });
}

export async function POST(req: Request) {
  return handle(async (ctx) => {
    await assertCatalogWriter(ctx, "O");
    const body = withoutPrices(await parseBody(req, createSchema), canSeePrices(ctx));
    const product = await createProduct(body, auditCtxOf(ctx, req));
    return maskPrices({ success: true, product }, canSeePrices(ctx));
  });
}

export async function PUT(req: Request) {
  return handle(async (ctx) => {
    await assertCatalogWriter(ctx, "D");
    const { id, ...data } = withoutPrices(await parseBody(req, updateSchema), canSeePrices(ctx));
    const product = await updateProduct(id, data, auditCtxOf(ctx, req));
    return maskPrices({ success: true, product }, canSeePrices(ctx));
  });
}

export async function DELETE(req: Request) {
  return handle(async (ctx) => {
    await assertCatalogWriter(ctx, "D");
    const id = new URL(req.url).searchParams.get("id");
    if (!id) return Response.json({ error: "Ürün ID zorunludur." }, { status: 400 });
    return deleteProduct(id, auditCtxOf(ctx, req));
  });
}
