import { handle } from "@/modules/minibar/server/apiAuthHelper";
import { cancelManualEntryRequest } from "@/modules/minibar/server/manualEntryRequests";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The sender takes back their own waiting request (same day only). */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async (ctx) => {
    const { id } = await params;
    return { success: true, ...(await cancelManualEntryRequest(ctx, id)) };
  });
}
