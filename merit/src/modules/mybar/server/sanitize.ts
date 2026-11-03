/**
 * Cleans a guest note: markup tags are stripped (inner text stays; nested tags are peeled in a
 * loop), control characters go, line breaks are capped at two in a row, the result is trimmed.
 */
export function sanitizeNote(raw: string): string {
  let text = raw;
  for (let previous = ""; previous !== text; ) {
    previous = text;
    text = text.replace(/<[^<>]*>/g, "");
  }
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    // Yön değiştirme (bidi), sıfır genişlikli ve C1/DEL karakterleri personel ekranını yanıltmasın.
    .replace(/[u007F-u009Fu200B-u200Fu202A-u202Eu2066-u2069uFEFF]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
