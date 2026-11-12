import { DomainError } from "@/lib/result";
import { handle } from "@/modules/minibar/server/apiAuthHelper";
import { MAX_BYTES, previewReceiptImage } from "@/modules/minibar/server/receiptOcr";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** Reads a photo of the delivery document on this server and returns the suggested lines. */
export async function POST(request: Request) {
  return handle(async (ctx) => {
    // Refuse an oversized body before reading it (the form adds a little to the file itself).
    const declared = Number(request.headers.get("content-length") ?? "");
    if (!Number.isFinite(declared) || declared <= 0 || declared > MAX_BYTES + 64 * 1024) {
      throw new DomainError("VALIDATION", "Evrak görseli en fazla 8 MB olabilir");
    }
    const form = await request.formData().catch(() => null);
    const file = form?.get("image");
    if (!(file instanceof File)) throw new DomainError("VALIDATION", "Evrak görseli seçilmedi");
    if (file.size > MAX_BYTES) throw new DomainError("VALIDATION", "Evrak görseli en fazla 8 MB olabilir");
    return previewReceiptImage(ctx, Buffer.from(await file.arrayBuffer()));
  });
}
