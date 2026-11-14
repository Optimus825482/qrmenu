import type { ReactNode } from "react";

export type HotelKey = "royal" | "diamond" | "premium";

const LABELS: Record<HotelKey, string> = { royal: "Royal", diamond: "Diamond", premium: "Premium" };
/** Fixed display order in a multi-hotel cell. */
const ORDER: HotelKey[] = ["royal", "diamond", "premium"];

/**
 * Which of the three hotels a name or code is ("Merit Royal Diamond", "DIAMOND", "Merit Royal Hotel" …).
 * Diamond and Premium are checked first: every hotel name contains "Royal".
 */
export function hotelKey(nameOrCode: string | null | undefined): HotelKey | null {
  const text = (nameOrCode ?? "").toLocaleLowerCase("en-US");
  if (text.includes("diamond")) return "diamond";
  if (text.includes("premium")) return "premium";
  if (text.includes("royal")) return "royal";
  return null;
}

/** Short hotel label for list cells; an unknown hotel keeps its own name. */
export function hotelShortName(nameOrCode: string | null | undefined): string {
  const key = hotelKey(nameOrCode);
  return key ? LABELS[key] : (nameOrCode ?? "").trim();
}

/** One hotel as a small badge (Royal / Diamond / Premium). The full name stays available as the tooltip. */
export function HotelBadge({ name }: { name: string }) {
  const key = hotelKey(name);
  return (
    <span className="hotel-badge" data-hotel={key ?? "other"} title={name}>
      {hotelShortName(name)}
    </span>
  );
}

/** Hotel cell of a list table: one badge per hotel, always in Royal → Diamond → Premium order. */
export function HotelBadges({ names, empty = "—" }: { names: readonly (string | null | undefined)[]; empty?: ReactNode }) {
  const seen = new Set<string>();
  const list = names
    .map((n) => (n ?? "").trim())
    .filter((n) => n && !seen.has(hotelShortName(n)) && seen.add(hotelShortName(n)));
  if (list.length === 0) return <>{empty}</>;
  const rank = (n: string) => {
    const key = hotelKey(n);
    return key ? ORDER.indexOf(key) : ORDER.length;
  };
  list.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b, "tr"));
  return (
    <span className="hotel-badges">
      {list.map((n) => (
        <HotelBadge key={n} name={n} />
      ))}
    </span>
  );
}

/** Room number as a small badge, shown next to the hotel badge of the room. */
export function RoomBadge({ number }: { number: string }) {
  return (
    <span className="room-badge" title={`Oda ${number}`}>
      Oda {number}
    </span>
  );
}
