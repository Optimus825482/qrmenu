import { handle } from "@/modules/minibar/server/apiAuthHelper";
import { deleteUpload } from "@/modules/minibar/server/occupancyUpload";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Reverts one upload (records, pending task items, the day's upload task). */
export async function DELETE(_request: Request, props: { params: Promise<{ uploadId: string }> }) {
  return handle(async (ctx) => {
    const { uploadId } = await props.params;
    return deleteUpload(ctx, uploadId);
  });
}
