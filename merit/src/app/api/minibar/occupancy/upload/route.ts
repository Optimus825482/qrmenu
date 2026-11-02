import { DomainError } from "@/lib/result";
import { handle, selectHotel } from "@/modules/minibar/server/apiAuthHelper";
import {
  MAX_UPLOAD_BYTES,
  processOccupancyExcel,
} from "@/modules/minibar/server/occupancyUploadService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Multipart overhead allowed on top of the 10 MB file limit. */
const MAX_BODY_BYTES = MAX_UPLOAD_BYTES + 256 * 1024;

/**
 * Fails closed: no session = 401, no MB-DOL "create" permission for the target hotel = 403. The
 * hotel is the session hotel or a selector value inside the user's scope, never an arbitrary id.
 */
export async function POST(request: Request) {
  return handle(async (ctx) => {
    const declared = Number(request.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
      throw new DomainError("VALIDATION", "Dosya en fazla 10 MB olabilir.");
    }

    // The target hotel travels in the multipart form, so it is authorised right after parsing and
    // before the file is touched.
    const formData = await request.formData().catch(() => {
      throw new DomainError("VALIDATION", "Geçersiz form verisi.");
    });
    const selected = formData.get("hotelId");
    const hotelId = await selectHotel(ctx, typeof selected === "string" ? selected : null, "MB-DOL", "O");

    const file = formData.get("file");
    if (!(file instanceof File)) {
      throw new DomainError("VALIDATION", "Lütfen bir Excel dosyası (.xlsx) seçiniz.");
    }
    if (file.size > MAX_UPLOAD_BYTES) throw new DomainError("VALIDATION", "Dosya en fazla 10 MB olabilir.");

    return processOccupancyExcel({
      buffer: Buffer.from(await file.arrayBuffer()),
      fileName: file.name || "occupancy.xlsx",
      hotelId,
      userId: ctx.user.id,
      forceScheduleOverride: formData.get("forceOverride") === "true",
    });
  });
}
