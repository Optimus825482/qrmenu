"use client";

import { Icon, type IconName } from "@/components/icons/Icon";
import { EmptyState } from "@/components/ui/EmptyState";
import { LAYER_LABELS, SEVERITY_LABELS, metricLayer, sparkPoints, sparkTotals } from "../../labels";
import type { RadarAlert, RadarLayer, RadarMetric, RadarOverview } from "../../types";
import type { ViewKey } from "../Toolbar";

const SEVERITY_ICON: Record<RadarMetric["severity"], IconName> = {
  ok: "check-circle",
  warn: "warning",
  crit: "error",
};

const SEVERITY_TONE: Record<RadarMetric["severity"], string> = { ok: "success", warn: "warn", crit: "danger" };

const LAYER_ORDER: RadarLayer[] = ["MINIBAR", "SIPARIS", "ODA_SERVISI", "PERSONEL", "SISTEM"];

/** The view a layer's counters lead to (only those that exist). */
const LAYER_VIEW: Partial<Record<RadarLayer, ViewKey>> = {
  MINIBAR: "kat",
  SIPARIS: "masa",
  ODA_SERVISI: "odaServisi",
  PERSONEL: "personel",
  SISTEM: "kuyruk",
};

/** Counters whose own view is more specific than their layer's (the MyBar lanes rather than the floor grid). */
const METRIC_VIEW: Partial<Record<RadarMetric["key"], ViewKey>> = {
  mybarPending: "mybar",
  mybarApproved: "mybar",
  mybarStale: "mybar",
};

export type OverviewProps = {
  overview: RadarOverview;
  /** Layers switched on in the toolbar; counters of the others are hidden. */
  layers?: ReadonlySet<RadarLayer>;
  onOpenHotel(hotelId: string): void;
  onOpenView(hotelId: string, view: ViewKey): void;
  /** Views that exist; counters only turn into buttons for those. */
  views?: readonly ViewKey[];
  /** The screen already lists every hotel's alerts above the cards (the strip of the whole complex): leave them out of the cards. */
  hideAlerts?: boolean;
};

function Counter({
  metric,
  target,
  onOpen,
}: {
  metric: RadarMetric;
  target?: ViewKey;
  onOpen(view: ViewKey): void;
}) {
  const inner = (
    <>
      <span className="rd-counter-value">
        {metric.value}
        {metric.unit ? <span className="rd-small" data-unit={metric.unit}> {metric.unit}</span> : null}
      </span>
      <span>{metric.label}</span>
      <span className="rd-counter-sev">
        <Icon name={SEVERITY_ICON[metric.severity]} size={12} />
        <span className="rd-counter-sev-text">{SEVERITY_LABELS[metric.severity]}</span>
      </span>
    </>
  );
  const tone = SEVERITY_TONE[metric.severity];
  return (
    <li>
      {target ? (
        <button type="button" className="rd-counter" data-tone={tone} onClick={() => onOpen(target)}>
          {inner}
        </button>
      ) : (
        <div className="rd-counter" data-tone={tone}>
          {inner}
        </div>
      )}
    </li>
  );
}

function AlertLine({ alert }: { alert: RadarAlert }) {
  const crit = alert.severity === "crit";
  return (
    <li className="rd-alert" data-tone={crit ? "danger" : "warn"}>
      <Icon name={crit ? "error" : "warning"} size={12} />
      <span>
        {crit ? "Kritik" : "Dikkat"}: {alert.text}
        {alert.count > 1 ? ` (${alert.count})` : ""}
      </span>
    </li>
  );
}

/** Genel Bakış: one card per hotel in scope with counters, a 60-minute event sparkline and the top alerts. */
export function Overview({ overview, layers, onOpenHotel, onOpenView, views, hideAlerts }: OverviewProps) {
  if (overview.hotels.length === 0) {
    return <EmptyState title="Bu kapsamda izlenecek otel yok." hint="Canlı Radar yetkisi olan bir otel görünmüyor." />;
  }
  const hasView = (v: ViewKey | undefined): v is ViewKey =>
    v !== undefined && (views ?? ["kat", "masa", "kuyruk", "odaServisi", "mybar", "personel"]).includes(v);

  return (
    <div className="rd-overview">
      {overview.hotels.map((hotel) => {
        const totals = sparkTotals(hotel.sparkline, layers);
        const sum = totals.reduce((a, b) => a + b, 0);
        const byLayer = LAYER_ORDER.map((layer) => ({
          layer,
          metrics: hotel.metrics.filter((m) => metricLayer(m.screenCode) === layer),
        })).filter((g) => g.metrics.length > 0 && (!layers || layers.has(g.layer)));
        const canOpenHotel = byLayer.some(({ layer }) => hasView(LAYER_VIEW[layer]));
        return (
          <article key={hotel.hotelId} className="rd-hotel-card" aria-label={`${hotel.code} ${hotel.name}`}>
            <div className="rd-hotel-head">
              <h3>
                <button
                  type="button"
                  className="rd-link"
                  disabled={!canOpenHotel}
                  onClick={() => onOpenHotel(hotel.hotelId)}
                >
                  {hotel.code} · {hotel.name}
                </button>
              </h3>
            </div>
            {byLayer.length === 0 ? (
              <p className="rd-muted">Açık katman yok.</p>
            ) : (
              byLayer.map(({ layer, metrics }) => (
                <section key={layer} aria-label={LAYER_LABELS[layer]}>
                  <h4 className="rd-layer-title">{LAYER_LABELS[layer]}</h4>
                  <ul className="rd-counters">
                    {metrics.map((m) => {
                      const own = METRIC_VIEW[m.key];
                      const target = hasView(own) ? own : LAYER_VIEW[layer];
                      return (
                        <Counter
                          key={m.key}
                          metric={m}
                          target={hasView(target) ? target : undefined}
                          onOpen={(v) => onOpenView(hotel.hotelId, v)}
                        />
                      );
                    })}
                  </ul>
                </section>
              ))
            )}
            <svg
              className="rd-spark"
              viewBox="0 0 120 28"
              preserveAspectRatio="none"
              role="img"
              aria-label={`Son 60 dakikada ${sum} olay`}
            >
              <polyline
                points={sparkPoints(totals, 120, 28)}
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                vectorEffect="non-scaling-stroke"
              />
            </svg>
            {hideAlerts ? null : hotel.topAlerts.length > 0 ? (
              <ul className="rd-alerts" aria-label="En önemli uyarılar">
                {hotel.topAlerts.slice(0, 2).map((a) => (
                  <AlertLine key={a.key} alert={a} />
                ))}
              </ul>
            ) : (
              <p className="rd-muted">Açık uyarı yok.</p>
            )}
          </article>
        );
      })}
    </div>
  );
}
