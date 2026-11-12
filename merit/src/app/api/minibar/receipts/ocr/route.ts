import { DomainError } from "@/lib/result";
import { handle } from "@/modules/minibar/server/apiAuthHelper";
import { previewReceiptImage } from "@/modules/minibar/server/receiptOcr";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** Reads a photo of the delivery document on this server and returns the suggested lines. */
export async function POST(request: Request) {
  return handle(async (ctx) => {
    const form = await request.formData().catch(() => null);
    const file = form?.get("image");
    if (!(file instanceof File)) throw new DomainError("VALIDATION", "Evrak görseli seçilmedi");
    return previewReceiptImage(ctx, Buffer.from(await file.arrayBuffer()));
  });
}
