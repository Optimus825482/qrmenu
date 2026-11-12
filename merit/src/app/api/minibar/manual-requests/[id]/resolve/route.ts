import { DomainError } from "@/lib/result";
import { handle } from "@/modules/minibar/server/apiAuthHelper";
import { resolveManualEntryRequest } from "@/modules/minibar/server/manualEntryRequests";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Approve (books the consumption to the room) or reject a manual entry request: minibar system managers only. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async (ctx) => {
    const { id } = await params;
    let body: { approved?: unknown; rejectReason?: unknown };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      throw new DomainError("VALIDATION", "Geçersiz istek gövdesi");
    }
    return { success: true, ...(await resolveManualEntryRequest(ctx, { requestId: id, approved: body.approved, rejectReason: body.rejectReason })) };
  });
}
