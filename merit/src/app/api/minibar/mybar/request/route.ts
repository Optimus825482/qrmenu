import { NextResponse } from "next/server";
import { z } from "zod";
import { clientIp } from "@/lib/rate-limit";
import { DomainError, fromZod } from "@/lib/result";
import { errorResponse } from "@/modules/minibar/server/apiAuthHelper";
import { createGuestMybarRequest, getMybarRoomDetails } from "@/modules/minibar/server/mybarService";
import { guestMeta } from "@/modules/menu/server/guestToken";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/*
 * Guest endpoints (no staff session): the QR token in the request is the only credential. Hotel and
 * room are always derived from it, never from the query string or the body.
 */

const tokenSchema = z.string().min(1).max(64);

export async function GET(request: Request) {
  try {
    const token = tokenSchema.safeParse(new URL(request.url).searchParams.get("token"));
    if (!token.success) throw new DomainError("VALIDATION", "QR kodu eksik.");
    return NextResponse.json(await getMybarRoomDetails(token.data, guestMeta(request.headers)));
  } catch (err) {
    return errorResponse(err);
  }
}

const bodySchema = z.object({
  token: tokenSchema,
  idempotencyKey: z.uuid("Geçersiz istek anahtarı"),
  language: z.string().max(8).optional(),
  note: z.string().max(500).optional(),
  items: z.array(z.object({ productId: z.string().min(1).max(64), qty: z.number().int() })).max(50),
});

export async function POST(request: Request) {
  try {
    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      throw new DomainError("VALIDATION", "Geçersiz istek gövdesi");
    }
    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) throw fromZod(parsed.error);
    const result = await createGuestMybarRequest({
      ...parsed.data,
      ip: clientIp(request.headers),
      userAgent: request.headers.get("user-agent") ?? "",
    });
    return NextResponse.json(result);
  } catch (err) {
    return errorResponse(err);
  }
}
