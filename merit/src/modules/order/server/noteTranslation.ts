import { translateNoteForStaff } from "@/modules/mybar/server/translateService";

/** Distinct notes translated per order: the order note plus this many item notes; the rest stay original. */
const MAX_NOTES_PER_ORDER = 12;

export type NoteTranslation = { noteTr: string | null; srcLang: string | null };
export type NoteTranslations = Map<string, NoteTranslation>;

/**
 * Guest notes of one order -> Turkish for staff, keyed by the original note. Runs before the order
 * transaction (provider calls must not hold a row lock) and never throws: an untranslated note simply
 * has no entry and staff sees the original. A guest reading the menu in Turkish is not translated.
 */
export async function translateOrderNotes(
  hotelId: string,
  guestLocale: string,
  notes: (string | null | undefined)[],
): Promise<NoteTranslations> {
  const out: NoteTranslations = new Map();
  if (guestLocale === "tr") return out;
  const distinct = [...new Set(notes.map((n) => n?.trim() ?? "").filter(Boolean))].slice(0, MAX_NOTES_PER_ORDER);
  if (distinct.length === 0) return out;
  const results = await Promise.all(distinct.map((note) => translateNoteForStaff(hotelId, note)));
  distinct.forEach((note, i) => {
    if (results[i].noteTr) out.set(note, results[i]);
  });
  return out;
}

/** Columns of one note for `order.create` / `orderItem.create`. */
export function translatedNote(translations: NoteTranslations, note: string | null | undefined): NoteTranslation {
  return (note && translations.get(note.trim())) || { noteTr: null, srcLang: null };
}

/**
 * What staff reads: the Turkish note, with the guest's own words kept beside it (`noteOriginal`) so a
 * doubtful machine translation — an allergy above all — can be checked against the original.
 */
export function staffNote(row: { note: string | null; noteTr?: string | null; noteSrcLang?: string | null }): {
  note?: string;
  noteOriginal?: string;
  noteLang?: string;
} {
  if (!row.note) return {};
  if (!row.noteTr || row.noteTr === row.note) return { note: row.note };
  return { note: row.noteTr, noteOriginal: row.note, ...(row.noteSrcLang ? { noteLang: row.noteSrcLang } : {}) };
}
