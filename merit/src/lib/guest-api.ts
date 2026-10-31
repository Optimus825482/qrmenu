import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { DomainError, fail, ok, type Result } from "@/lib/result";

const NO_STORE = { "Cache-Control": "no-store" };

/** Parses a JSON object body; anything else is a VALIDATION error. */
export async function readJsonBody(request: Request): Promise<Record<string, unknown>> {
  try {
    const body: unknown = await request.json();
    if (body && typeof body === "object" && !Array.isArray(body)) return body as Record<string, unknown>;
  } catch {
    // fall through
  }
  throw new DomainError("VALIDATION", "Geçersiz istek gövdesi");
}

/**
 * Runs a guest API handler and answers a JSON `Result`: HTTP status is the DomainError's, anything
 * unexpected is logged with an error id and answered 500 INTERNAL.
 */
export async function guestResult<T>(handler: () => Promise<T>): Promise<NextResponse<Result<T>>> {
  try {
    return NextResponse.json(ok(await handler()), { headers: NO_STORE });
  } catch (error) {
    if (error instanceof DomainError) {
      return NextResponse.json({ ok: false, error: error.toResultError() }, { status: error.httpStatus, headers: NO_STORE });
    }
    const errorId = randomBytes(4).toString("hex");
    console.error(`[guest api] ${errorId}`, error);
    return NextResponse.json(fail("INTERNAL", "Beklenmeyen bir hata oluştu", { errorId }), {
      status: 500,
      headers: NO_STORE,
    });
  }
}
