// Client-safe privacy helpers (spec 3.7).

export const FORBIDDEN_KEYS: readonly string[] = [
  "note",
  "noteTr",
  "price",
  "subtotal",
  "unitPrice",
  "ip",
  "userAgent",
  "guestMessage",
  "rejectReason",
  "closeNote",
  "cancelNote",
];

/** Paths (`"a.note"`, `"b[0].unitPrice"`) of every forbidden key anywhere inside `value`. */
export function findForbiddenKeys(value: unknown): string[] {
  const found: string[] = [];
  const walk = (v: unknown, path: string): void => {
    if (Array.isArray(v)) {
      v.forEach((item, i) => walk(item, `${path}[${i}]`));
      return;
    }
    if (typeof v !== "object" || v === null) return;
    for (const [key, child] of Object.entries(v)) {
      const next = path ? `${path}.${key}` : key;
      if (FORBIDDEN_KEYS.includes(key)) found.push(next);
      walk(child, next);
    }
  };
  walk(value, "");
  return found;
}

/** "Ayşe Kaya" -> "Ayşe K."; the last word is shortened, a single word stays as is. */
export function shortName(full: string): string {
  const words = full.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "—";
  if (words.length === 1) return words[0]!;
  const last = words[words.length - 1]!;
  const initial = [...last][0]!.toLocaleUpperCase("tr-TR");
  return `${words.slice(0, -1).join(" ")} ${initial}.`;
}
