"use client";

import { XpIcon } from "../icons";

export type HotelInfo = { id: string; name: string; code: string };

/** Hotel cards shown inside a window whose app needs a hotel context and has none yet. */
export function HotelPicker({
  hotels,
  onPick,
}: {
  hotels: HotelInfo[];
  onPick(hotelId: string): void;
}) {
  return (
    <div className="xp-hotel-picker">
      <h2>Otel seçin</h2>
      <p>Bu uygulama bir otel bağlamında çalışır. Pencere seçilen otelin verisini gösterir.</p>
      {hotels.length === 0 ? (
        <p>Kapsamınızda etkin otel yok.</p>
      ) : (
        <div className="xp-hotel-cards">
          {hotels.map((h) => (
            <button key={h.id} type="button" className="xp-hotel-card" onClick={() => onPick(h.id)}>
              <XpIcon name="otel" />
              <span>
                <strong>{h.name}</strong>
                <span>{h.code}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
