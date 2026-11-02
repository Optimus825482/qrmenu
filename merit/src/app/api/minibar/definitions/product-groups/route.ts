import { NextResponse } from "next/server";
import {
  listProductGroups,
  createProductGroup,
  updateProductGroup,
  deleteProductGroup,
} from "@/modules/minibar/server/minibarDefinitionsService";
import { getAuditCtxFromRequest } from "@/modules/minibar/server/apiAuthHelper";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const groups = await listProductGroups();
    return NextResponse.json({ groups });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Ürün grupları alınamadı.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await getAuditCtxFromRequest(req);
    const body = await req.json();
    const group = await createProductGroup(body, ctx);
    return NextResponse.json({ success: true, group });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Ürün grubu oluşturulamadı.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function PUT(req: Request) {
  try {
    const ctx = await getAuditCtxFromRequest(req);
    const body = await req.json();
    const { id, ...data } = body;
    if (!id) return NextResponse.json({ error: "Grup ID zorunludur." }, { status: 400 });

    const group = await updateProductGroup(id, data, ctx);
    return NextResponse.json({ success: true, group });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Ürün grubu güncellenemedi.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(req: Request) {
  try {
    const ctx = await getAuditCtxFromRequest(req);
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Grup ID zorunludur." }, { status: 400 });

    const result = await deleteProductGroup(id, ctx);
    return NextResponse.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Ürün grubu silinemedi.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
