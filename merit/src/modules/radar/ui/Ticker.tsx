"use client";

import { useMemo } from "react";
import { Icon } from "@/components/icons/Icon";
import type { RadarState } from "../state";
import type { RadarEvent } from "../types";
import { describeEvent, lookupFromState, type NameStyle } from "./eventSentence";
import { LAYER_ICONS } from "./Toolbar";

export const TICKER_MAX_ITEMS = 100;

const clock = (iso: string) =>
  new Intl.DateTimeFormat("tr-TR", {
    timeZone: "Europe/Nicosia",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date(Date.parse(iso) || 0));

export type TickerProps = {
  events: readonly RadarEvent[];
  state?: RadarState | null;
  mode?: "window" | "wall";
  nameStyle?: NameStyle;
  onSelect?(event: RadarEvent): void;
};

/**
 * Live event ticker (spec 2.2): newest on top, <= 100 rows in window mode (6 horizontal in wall 1080p).
 * Layers are distinguished by icon shape (`LAYER_ICONS`), never by colour alone.
 */
export function Ticker({ events, state, mode = "window", nameStyle, onSelect }: TickerProps) {
  const style: NameStyle = nameStyle ?? (mode === "wall" ? "short" : "full");
  const people = state?.people ?? {};
  const lookup = useMemo(() => lookupFromState(state), [state]);
  const limit = mode === "wall" ? 6 : TICKER_MAX_ITEMS;

  const items = useMemo(() => {
    const out: RadarEvent[] = [];
    for (let i = events.length - 1; i >= 0 && out.length < limit; i--) {
      out.push(events[i]!);
    }
    return out;
  }, [events, limit]);

  return (
    <aside className="rd-ticker" data-mode={mode} aria-label="Olay şeridi">
      <div className="rd-ticker-head">
        <h3>Olay akışı</h3>
        <span className="rd-muted rd-small">{items.length} olay</span>
      </div>
      {items.length === 0 ? (
        <p className="rd-muted rd-small">Henüz olay yok.</p>
      ) : (
        <ul className="rd-ticker-list">
          {items.map((ev) => {
            const sentence = describeEvent(ev, people, style, lookup);
            const content = (
              <>
                <span className="rd-ticker-time">{clock(ev.at)}</span>
                <Icon name={LAYER_ICONS[ev.layer]} size={13} />
                <span className="rd-ticker-text">{sentence}</span>
              </>
            );
            return (
              <li key={ev.id} className="rd-ticker-row">
                {onSelect ? (
                  <button type="button" className="rd-ticker-btn" onClick={() => onSelect(ev)}>
                    {content}
                  </button>
                ) : (
                  <div className="rd-ticker-btn">{content}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </aside>
  );
}
