/** MMD (misafir müsait değil): why the room could not be checked now. Recorded as a DND check with this note. */
export const MMD_REASONS = [
  "Misafir uyuyor",
  "Misafir banyoda",
  "Misafir istemedi",
  "Misafir daha sonra gelmemizi istedi",
  "Misafir telefonda",
  "Misafir odaya girilmesini istemedi, ürünleri kapıdan aldı",
] as const;

/** Note of the DND check an MMD leaves behind (also the start of a manual entry request's explanation). */
export const mmdNote = (reason: string): string => `MMD: ${reason}`;

/** True for the note of an MMD record (a reason is required: "MMD: " alone is not one). */
export const isMmdNote = (note: string | null | undefined): boolean => /^MMD: \S/.test(note ?? "");

/** What the attendant is asked right after an MMD is recorded. */
export const mmdConsumptionQuestion = (roomNumber: string, reason: string): string =>
  `“${reason}” nedeni ile girilemeyen Oda ${roomNumber} için tüketim kaydı oluşturmak istiyor musunuz?`;
