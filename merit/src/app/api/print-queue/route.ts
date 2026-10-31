import { DomainError } from "@/lib/result";
import { errorResponse, gatewayAuthorized, unauthorized } from "@/lib/gateway-auth";
import { printJobs } from "@/modules/order/server/printJobs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Gateway poll: atomically claims queued print jobs (`?hotel=MR&limit=10`). */
export async function GET(request: Request): Promise<Response> {
  if (!gatewayAuthorized(request)) return unauthorized();
  try {
    const url = new URL(request.url);
    const hotel = url.searchParams.get("hotel");
    if (!hotel) throw new DomainError("VALIDATION", "hotel parametresi gerekli");
    const raw = Number(url.searchParams.get("limit"));
    const jobs = await printJobs.claim(hotel, Number.isFinite(raw) && raw > 0 ? raw : undefined);
    return Response.json({ jobs });
  } catch (error) {
    return errorResponse(error);
  }
}
