/**
 * Validates a `?next=` value before the login screen navigates to it. Only same-origin relative
 * paths pass: a single leading "/", no protocol-relative "//host", no backslash tricks
 * ("/\host" is read as "//host" by browsers), no control characters. Anything else is null.
 */
export function safeNextPath(value: string | string[] | null | undefined): string | null {
  if (typeof value !== "string") return null;
  if (!value.startsWith("/") || value.startsWith("//")) return null;
  if (value.includes("\\")) return null;
  if (/[\u0000-\u001f\u007f]/.test(value)) return null;
  return value;
}
