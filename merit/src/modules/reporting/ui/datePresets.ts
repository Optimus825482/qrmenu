import { businessDate } from "@/lib/time";

export type Preset = "bugun" | "dun" | "buHafta" | "son7" | "son30" | "buAy" | "gecenAy";

/** Presets offered in the UI, in order ("Özel" is the absence of a preset). */
export const PRESET_LABELS: { id: Preset; label: string }[] = [
  { id: "bugun", label: "Bugün" },
  { id: "dun", label: "Dün" },
  { id: "buHafta", label: "Bu hafta" },
  { id: "buAy", label: "Bu ay" },
  { id: "son30", label: "Son 30 gün" },
];

const DAY_MS = 86_400_000;
const parse = (day: string) => new Date(`${day}T00:00:00.000Z`);
const fmt = (d: Date) => d.toISOString().slice(0, 10);
const shift = (day: string, days: number) => fmt(new Date(parse(day).getTime() + days * DAY_MS));

/**
 * Closed business-day interval for a preset, counted on the Europe/Nicosia business day of `now`.
 * `buHafta` starts on Monday; `son7`/`son30` end today and reach 6/29 days back.
 */
export function presetRange(preset: Preset, now: Date = new Date()): { from: string; to: string } {
  const today = businessDate(now);
  switch (preset) {
    case "bugun":
      return { from: today, to: today };
    case "dun": {
      const y = shift(today, -1);
      return { from: y, to: y };
    }
    case "buHafta": {
      const dow = (parse(today).getUTCDay() + 6) % 7; // Monday = 0
      return { from: shift(today, -dow), to: today };
    }
    case "son7":
      return { from: shift(today, -6), to: today };
    case "son30":
      return { from: shift(today, -29), to: today };
    case "buAy":
      return { from: `${today.slice(0, 8)}01`, to: today };
    case "gecenAy": {
      const first = `${today.slice(0, 8)}01`;
      const last = shift(first, -1);
      return { from: `${last.slice(0, 8)}01`, to: last };
    }
  }
}
