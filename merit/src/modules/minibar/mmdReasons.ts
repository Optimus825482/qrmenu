/** MMD (misafir müsait değil): why the room could not be entered. Its own record (server/mmd.ts), not a DND. */
export const MMD_REASONS = [
  "Misafir uyuyor",
  "Misafir banyoda",
  "Misafir istemedi",
  "Misafir daha sonra gelmemizi istedi",
  "Misafir telefonda",
  "Misafir odaya girilmesini istemedi, ürünleri kapıdan aldı",
] as const;

/** Start of the explanation of a manual entry request that follows an MMD (the MMD report matches on it). */
export const mmdNote = (reason: string): string => `MMD: ${reason}`;

/** What the attendant is asked right after an MMD is recorded. */
export const mmdConsumptionQuestion = (roomNumber: string, reason: string): string =>
  `“${reason}” nedeni ile girilemeyen Oda ${roomNumber} için tüketim kaydı oluşturmak istiyor musunuz?`;
