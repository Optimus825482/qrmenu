/** Text of a number field as a number; blank or not a number = `undefined` (the server reports it). */
export function numberOrUndefined(text: string | undefined): number | undefined {
  const trimmed = text?.trim();
  if (!trimmed) return undefined;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : undefined;
}
