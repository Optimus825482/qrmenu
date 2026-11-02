import { handle } from "@/modules/minibar/server/apiAuthHelper";
import { previewOccupancy } from "@/modules/minibar/server/occupancyUpload";
import type { UploadKind } from "@/modules/minibar/server/occupancyParse";
import { readOccupancyForm } from "../_form";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Dry run of an upload: parses the file against the hotel's rooms and writes nothing. */
export async function POST(request: Request) {
  return handle(async (ctx) => {
    const form = await readOccupancyForm(request);
    return previewOccupancy(ctx, { ...form, kind: form.kind as UploadKind | undefined });
  });
}
