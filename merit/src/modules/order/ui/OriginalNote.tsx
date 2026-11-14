/**
 * The guest's own words under a note that staff reads in Turkish (machine translated). Shown so a
 * doubtful translation — an allergy above all — can be checked; renders nothing for an untranslated note.
 */
export function OriginalNote({ text, lang }: { text?: string | null; lang?: string | null }) {
  if (!text) return null;
  return (
    <span className="block opacity-80" style={{ fontSize: "0.85em", fontWeight: 400 }} data-testid="note-original">
      Orijinal{lang ? ` (${lang.toUpperCase()})` : ""}: <span dir="auto" lang={lang ?? undefined}>{text}</span>
    </span>
  );
}
