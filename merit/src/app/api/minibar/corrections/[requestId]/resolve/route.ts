import { z } from "zod";
import { assertCan } from "@/lib/rbac";
import { DomainError } from "@/lib/result";
import { handle, parseBody } from "@/modules/minibar/server/apiAuthHelper";
import { correctionRequestHotel, resolveCorrectionRequest } from "@/modules/minibar/server/minibarService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  approved: z.boolean(),
  rejectReason: z.string().max(500).optional(),
});

export async function POST(request: Request, props: { params: Promise<{ requestId: string }> }) {
  return handle(async (ctx) => {
    const { requestId } = await props.params;
    const hotelId = await correctionRequestHotel(requestId);
    await assertCan(ctx, "MB-TAL", "A", hotelId);
    // Past-dated corrections are decided by the system administrators / management only.
    if (ctx.user.roleKind !== "SISTEM" && ctx.user.roleKind !== "YONETIM") {
      throw new DomainError("FORBIDDEN", "Düzeltme taleplerini yalnızca yönetim onaylayabilir.");
    }
    const body = await parseBody(request, bodySchema);
    return resolveCorrectionRequest({ requestId, approverId: ctx.user.id, hotelId, ...body });
  });
}
