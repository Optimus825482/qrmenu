import { handle } from "@/modules/minibar/server/apiAuthHelper";
import { commitOccupancy } from "@/modules/minibar/server/occupancyUpload";
import type { UploadKind } from "@/modules/minibar/server/occupancyParse";
import { readOccupancyForm } from "../_form";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Fails closed: no session = 401, no MB-DOL "O" (upload) permission for the target hotel = 403.
 * The permission is checked inside `commitOccupancy` BEFORE the workbook is parsed; without a
 * `kind` field the kind detected from the file is used (detected after the permission check).
 */
export async function POST(request: Request) {
  return handle(async (ctx) => {
    const form = await readOccupancyForm(request);
    return commitOccupancy(ctx, {
      fileName: form.fileName,
      data: form.data,
      hotelId: form.hotelId,
      kind: form.kind as UploadKind | undefined,
    });
  });
}
