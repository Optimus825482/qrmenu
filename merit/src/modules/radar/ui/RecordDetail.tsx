"use client";

import { useEffect, useState } from "react";
import type { RadarRecordDetail } from "../types";
import { radarRecordDetailAction } from "../server/actions/radar";

const clock = (iso: string) =>
  new Intl.DateTimeFormat("tr-TR", { timeZone: "Europe/Nicosia", hour: "2-digit", minute: "2-digit", hour12: false }).format(
    new Date(iso),
  );

type Loaded = { key: string; detail: RadarRecordDetail } | { key: string; error: string };

/**
 * The deepest level of a record's panel: what was ordered and the stages it went through, read when the panel
 * opens. `version` is whatever changes when the record does (its status, its order count): a change re-reads it,
 * so the panel follows the live card above it. `enabled` is false while the screen shows a past instant (scrub,
 * day replay, demo): the detail is today's, and would contradict the card.
 */
export function RecordDetail({
  hotelId,
  kind,
  id,
  version,
  enabled = true,
}: {
  hotelId: string;
  kind: RadarRecordDetail["kind"];
  id: string;
  version: string;
  enabled?: boolean;
}) {
  const key = `${hotelId}|${kind}|${id}|${version}`;
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let stale = false;
    void radarRecordDetailAction({ hotelId, kind, id }).then(
      (r) => {
        if (stale) return;
        setLoaded(r.ok ? { key, detail: r.data } : { key, error: r.error.message });
      },
      () => {
        if (!stale) setLoaded({ key, error: "Ayrıntı yüklenemedi." });
      },
    );
    return () => {
      stale = true;
    };
  }, [enabled, hotelId, kind, id, key]);

  if (!enabled) return <p className="rd-muted rd-small">Kayıt ayrıntısı yalnız canlı görünümde gösterilir.</p>;
  // The last answer of the same record stays up while a newer one loads; another record's never shows.
  const mine = loaded && loaded.key.startsWith(`${hotelId}|${kind}|${id}|`) ? loaded : null;
  if (!mine) return <p className="rd-muted rd-small" aria-busy="true">Ayrıntı yükleniyor…</p>;
  if ("error" in mine) return <p className="rd-muted rd-small" role="status">{mine.error}</p>;

  return (
    <div className="rd-record">
      {mine.detail.sections.map((s) => {
        const lines = s.lines ?? [];
        const steps = s.steps ?? [];
        return (
          <section key={s.title} aria-label={s.title}>
            <h4>{s.title}</h4>
            {lines.length === 0 && steps.length === 0 ? <p className="rd-muted rd-small">{s.empty ?? "Kayıt yok."}</p> : null}
            {lines.length > 0 ? (
              <ul className="rd-list">
                {lines.map((l, i) => (
                  <li key={`${l.name}-${i}`} className="rd-row">
                    <span>{l.name}</span>
                    <span className="rd-badge" data-tone="muted">
                      ×{l.qty}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
            {steps.length > 0 ? (
              <ol className="rd-list">
                {steps.map((st, i) => (
                  <li key={`${st.label}-${st.at}-${i}`} className="rd-row">
                    <span>
                      {st.label}
                      {st.by ? <span className="rd-muted"> · {st.by}</span> : null}
                    </span>
                    <time dateTime={st.at}>{clock(st.at)}</time>
                  </li>
                ))}
              </ol>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}
