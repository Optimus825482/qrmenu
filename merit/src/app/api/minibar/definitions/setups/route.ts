import { NextResponse } from "next/server";
import {
  listSetups,
  createSetup,
  updateSetup,
  deleteSetup,
} from "@/modules/minibar/server/minibarDefinitionsService";
import { getAuditCtxFromRequest } from "@/modules/minibar/server/apiAuthHelper";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const setups = await listSetups();
    return NextResponse.json({ setups });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Setup tanımları alınamadı.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await getAuditCtxFromRequest(req);
    const body = await req.json();
    const setup = await createSetup(body, ctx);
    return NextResponse.json({ success: true, setup });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Setup oluşturulamadı.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function PUT(req: Request) {
  try {
    const ctx = await getAuditCtxFromRequest(req);
    const body = await req.json();
    const { id, ...data } = body;
    if (!id) return NextResponse.json({ error: "Setup ID zorunludur." }, { status: 400 });

    const setup = await updateSetup(id, data, ctx);
    return NextResponse.json({ success: true, setup });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Setup güncellenemedi.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(req: Request) {
  try {
    const ctx = await getAuditCtxFromRequest(req);
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Setup ID zorunludur." }, { status: 400 });

    const result = await deleteSetup(id, ctx);
    return NextResponse.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Setup silinemedi.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
