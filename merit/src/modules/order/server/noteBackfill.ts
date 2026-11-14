import type { NoteTranslation } from "./noteTranslation";

export type PendingNote = { hotelId: string; note: string };
export type TranslateNote = (hotelId: string, note: string) => Promise<NoteTranslation>;

/** Provider calls in flight at once: old notes are in no hurry, the provider's rate limit is. */
const CONCURRENCY = 3;

/** One note of one hotel (translation is switched per hotel, so the hotel is part of the key). */
export const noteKey = (hotelId: string, note: string) => `${hotelId}\n${note.trim()}`;

export type BackfillResult = {
  /** Notes that got a Turkish text, by `noteKey`. */
  translated: Map<string, NoteTranslation>;
  /** Notes that need no translation (written in Turkish, or the provider left them unchanged), by `noteKey`. */
  turkish: Set<string>;
  /** Notes without an answer (provider down, translation switched off, note too long). */
  failed: number;
};

/**
 * Old guest notes -> Turkish, each distinct note of a hotel once (pure but for `translate`).
 * Used by scripts/siparis-notu-geriye-donuk-ceviri.ts, which reads the notes and writes the result.
 */
export async function translatePendingNotes(notes: PendingNote[], translate: TranslateNote): Promise<BackfillResult> {
  const distinct = new Map<string, PendingNote>();
  for (const n of notes) {
    const note = n.note.trim();
    if (note) distinct.set(noteKey(n.hotelId, note), { hotelId: n.hotelId, note });
  }
  const result: BackfillResult = { translated: new Map(), turkish: new Set(), failed: 0 };
  const queue = [...distinct.entries()];
  const worker = async () => {
    for (let next = queue.shift(); next; next = queue.shift()) {
      const [key, { hotelId, note }] = next;
      const answer = await translate(hotelId, note);
      if (answer.noteTr && answer.noteTr !== note) result.translated.set(key, answer);
      else if (answer.noteTr || answer.srcLang) result.turkish.add(key);
      else result.failed += 1;
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  return result;
}
