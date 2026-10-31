import { DomainError } from "@/lib/result";
import { errorResponse, gatewayAuthorized, unauthorized } from "@/lib/gateway-auth";
import { printJobs } from "@/modules/order/server/printJobs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Gateway report of one print attempt: `{ ok: true } | { ok: false, error }` → 204. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  if (!gatewayAuthorized(request)) return unauthorized();
  try {
    const { id } = await params;
    const body = (await request.json().catch(() => null)) as { ok?: unknown; error?: unknown } | null;
    if (!body || typeof body.ok !== "boolean") {
      throw new DomainError("VALIDATION", "Gövde { ok: boolean, error?: string } olmalı");
    }
    if (body.ok) {
      await printJobs.report(id, { ok: true });
    } else {
      if (typeof body.error !== "string") {
        throw new DomainError("VALIDATION", "Başarısız deneme için error metni gerekli");
      }
      await printJobs.report(id, { ok: false, error: body.error });
    }
    return new Response(null, { status: 204 });
  } catch (error) {
    return errorResponse(error);
  }
}
