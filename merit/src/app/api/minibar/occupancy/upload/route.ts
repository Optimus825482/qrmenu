import { businessDate } from "@/lib/time";
import { handle } from "@/modules/minibar/server/apiAuthHelper";
import { commitOccupancy } from "@/modules/minibar/server/occupancyUpload";
import { parseWorkbook, type UploadKind } from "@/modules/minibar/server/occupancyParse";
import { readOccupancyForm } from "../_form";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Fails closed: no session = 401, no MB-DOL "create" permission for the target hotel = 403 (checked
 * in the service before the file is read). Without a `kind` field the detected kind is used.
 */
export async function POST(request: Request) {
  return handle(async (ctx) => {
    const form = await readOccupancyForm(request);
    const kind =
      (form.kind as UploadKind | undefined) ??
      (await parseWorkbook(form.data, { today: businessDate() })).detectedKind;
    return commitOccupancy(ctx, { fileName: form.fileName, data: form.data, hotelId: form.hotelId, kind });
  });
}
