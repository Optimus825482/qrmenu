import { NextResponse } from "next/server";
import {
  listSetupItems,
  addOrUpdateSetupItem,
  deleteSetupItem,
} from "@/modules/minibar/server/minibarDefinitionsService";
import { getAuditCtxFromRequest } from "@/modules/minibar/server/apiAuthHelper";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const setupId = searchParams.get("setupId");
    if (!setupId) return NextResponse.json({ error: "Setup ID zorunludur." }, { status: 400 });

    const items = await listSetupItems(setupId);
    return NextResponse.json({ items });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Setup içerikleri alınamadı.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await getAuditCtxFromRequest(req);
    const body = await req.json();
    const item = await addOrUpdateSetupItem(body, ctx);
    return NextResponse.json({ success: true, item });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Setup içeriği kaydedilemedi.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(req: Request) {
  try {
    const ctx = await getAuditCtxFromRequest(req);
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Setup öğe ID zorunludur." }, { status: 400 });

    const result = await deleteSetupItem(id, ctx);
    return NextResponse.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Setup öğesi silinemedi.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
