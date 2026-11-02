import { NextResponse } from "next/server";
import {
  listProducts,
  createProduct,
  updateProduct,
  deleteProduct,
} from "@/modules/minibar/server/minibarDefinitionsService";
import { getAuditCtxFromRequest } from "@/modules/minibar/server/apiAuthHelper";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const groupId = searchParams.get("groupId") || undefined;
    const search = searchParams.get("search") || undefined;
    const isActiveParam = searchParams.get("isActive");
    const isActive = isActiveParam !== null ? isActiveParam === "true" : undefined;

    const products = await listProducts({ groupId, search, isActive });
    return NextResponse.json({ products });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Ürünler alınamadı.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await getAuditCtxFromRequest(req);
    const body = await req.json();
    const product = await createProduct(body, ctx);
    return NextResponse.json({ success: true, product });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Ürün oluşturulamadı.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function PUT(req: Request) {
  try {
    const ctx = await getAuditCtxFromRequest(req);
    const body = await req.json();
    const { id, ...data } = body;
    if (!id) return NextResponse.json({ error: "Ürün ID zorunludur." }, { status: 400 });

    const product = await updateProduct(id, data, ctx);
    return NextResponse.json({ success: true, product });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Ürün güncellenemedi.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(req: Request) {
  try {
    const ctx = await getAuditCtxFromRequest(req);
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Ürün ID zorunludur." }, { status: 400 });

    const result = await deleteProduct(id, ctx);
    return NextResponse.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Ürün silinemedi.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
