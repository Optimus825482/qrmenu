import { DomainError } from "@/lib/result";
import { OCCUPANCY_MAX_BYTES } from "@/modules/minibar/server/occupancyParse";

/** Multipart overhead allowed on top of the 10 MB file limit. */
const MAX_BODY_BYTES = OCCUPANCY_MAX_BYTES + 256 * 1024;

export type OccupancyForm = { data: Buffer; fileName: string; hotelId?: string; kind?: string };

/** Reads the multipart body of an occupancy upload/preview (size guarded before the body is read). */
export async function readOccupancyForm(request: Request): Promise<OccupancyForm> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    throw new DomainError("VALIDATION", "Dosya 10 MB'ı aşamaz");
  }
  const form = await request.formData().catch(() => {
    throw new DomainError("VALIDATION", "Geçersiz form verisi.");
  });
  const file = form.get("file");
  if (!(file instanceof File)) throw new DomainError("VALIDATION", "Lütfen bir Excel dosyası (.xlsx) seçiniz.");
  if (file.size > OCCUPANCY_MAX_BYTES) throw new DomainError("VALIDATION", "Dosya 10 MB'ı aşamaz");
  const hotelId = form.get("hotelId");
  const kind = form.get("kind");
  return {
    data: Buffer.from(await file.arrayBuffer()),
    fileName: file.name || "doluluk.xlsx",
    ...(typeof hotelId === "string" && hotelId ? { hotelId } : {}),
    ...(typeof kind === "string" && kind ? { kind } : {}),
  };
}
