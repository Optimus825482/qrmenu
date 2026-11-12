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
