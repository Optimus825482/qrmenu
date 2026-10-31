import { createHash, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";
import { DomainError } from "@/lib/result";

/** Both sides are hashed first: equal digest lengths (no length leak) and a constant-time compare. */
function digest(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

/** `Authorization: Bearer <PRINT_GATEWAY_KEY>` check for the print gateway API. */
export function gatewayAuthorized(request: Request): boolean {
  if (env.PRINT_GATEWAY_KEY.length === 0) return false;
  const match = /^Bearer\s+(.+)$/i.exec(request.headers.get("authorization") ?? "");
  if (!match) return false;
  return timingSafeEqual(digest(match[1]), digest(env.PRINT_GATEWAY_KEY));
}

export function unauthorized(): Response {
  return Response.json(
    { ok: false, error: { code: "UNAUTHORIZED", message: "Geçersiz gateway anahtarı" } },
    { status: 401 },
  );
}

/** DomainError → its HTTP status; anything else logged as INTERNAL (never leaked to the client). */
export function errorResponse(error: unknown): Response {
  if (error instanceof DomainError) {
    return Response.json({ ok: false, error: error.toResultError() }, { status: error.httpStatus });
  }
  console.error("[print-queue]", error);
  return Response.json(
    { ok: false, error: { code: "INTERNAL", message: "Beklenmeyen bir hata oluştu" } },
    { status: 500 },
  );
}
