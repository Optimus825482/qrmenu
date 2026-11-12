import { DomainError } from "@/lib/result";
import { readUpload } from "@/lib/uploads";
import { handle } from "@/modules/minibar/server/apiAuthHelper";
import { receiptImagePath } from "@/modules/minibar/server/receipts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The stored document image of a delivery (stock managers only). */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async (ctx) => {
    const { id } = await params;
    const file = await readUpload(await receiptImagePath(ctx, id));
    if (!file) throw new DomainError("NOT_FOUND", "Evrak görseli bulunamadı");
    return new Response(new Uint8Array(file.data), {
      headers: { "Content-Type": file.contentType, "Cache-Control": "private, no-store" },
    });
  });
}
