import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { confirmMybarRequest } from "@/modules/minibar/server/minibarService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    let userId: string | undefined;
    try {
      const ctx = await requireUser();
      userId = ctx.user.id;
    } catch {
      // Allow fallback
    }

    const body = await request.json();
    const requestId = body.requestId;
    if (!requestId) {
      return NextResponse.json({ error: "Talep ID belirtilmedi." }, { status: 400 });
    }

    const result = await confirmMybarRequest(requestId, userId);
    return NextResponse.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "MyBar talebi onaylanırken hata oluştu.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
