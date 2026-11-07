"use client";

import type { ChangeEvent } from "react";
import { Icon } from "@/components/icons/Icon";
import type { RadarMetric } from "@/modules/radar/types";
import type { KpiResponse } from "../server/radar/kpi";
import type { KpiHotelOption, KpiScopeChoice } from "./useRadarKpi";

const SEVERITY = {
  ok: { label: "Normal", tone: "bg-success/10 text-success", icon: "check" },
  warn: { label: "Dikkat", tone: "bg-warn/10 text-warn", icon: "warning" },
  crit: { label: "Kritik", tone: "bg-danger/10 text-danger", icon: "error" },
} as const;

const number = new Intl.NumberFormat("tr-TR");

/** `12`, `85 %` — percentages carry the sign, counts stay bare (the label says what is counted). */
export function formatKpiValue(m: Pick<RadarMetric, "value" | "unit">): string {
  const v = number.format(m.value);
  return m.unit === "%" ? `%${v}` : v;
}

const scopeValue = (c: KpiScopeChoice) => (c.scope === "hotel" ? `hotel:${c.hotelId}` : "total");

export type KpiChipsProps = {
  data: KpiResponse | null;
  error?: string | null;
  stale?: boolean;
  choice: KpiScopeChoice;
  hotels: KpiHotelOption[];
  onScopeChange(next: KpiScopeChoice): void;
  /** Whether the metric's screen can be opened (omitted: chips are plain, e.g. on mobile). */
  canOpen?(screenCode: string): boolean;
  onOpen?(screenCode: string): void;
  compact?: boolean;
};

/** Komuta Merkezi / İzleme KPI chips. Only metrics present in `data.totals` render: a missing key is not permitted. */
export function KpiChips({ data, error, stale, choice, hotels, onScopeChange, canOpen, onOpen, compact }: KpiChipsProps) {
  const metrics = data ? Object.values(data.totals).filter((m): m is RadarMetric => m !== undefined) : [];
  const showSwitch = hotels.length > 1;

  const onSelect = (e: ChangeEvent<HTMLSelectElement>) => {
    const v = e.target.value;
    onScopeChange(v === "total" ? { scope: "total" } : { scope: "hotel", hotelId: v.slice("hotel:".length) });
  };

  return (
    <section aria-label="KPI çipleri" data-testid="kpi-chips" className="flex flex-col gap-1.5">
      {showSwitch || stale || error ? (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {showSwitch ? (
            <label className="flex items-center gap-1">
              <span>Kapsam</span>
              <select
                data-testid="kpi-scope"
                className="rounded border border-border bg-surface px-1 py-0.5 text-text"
                value={scopeValue(choice)}
                onChange={onSelect}
              >
                <option value="total">Tüm kompleks</option>
                {hotels.map((h) => (
                  <option key={h.hotelId} value={`hotel:${h.hotelId}`}>
                    {h.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {stale ? (
            <span data-testid="kpi-stale" role="status" className="rounded bg-warn/10 px-1.5 py-0.5 text-warn">
              Veriler eski olabilir
            </span>
          ) : null}
          {error ? (
            <span role="alert" className="text-danger">
              {error}
            </span>
          ) : null}
        </div>
      ) : null}
      <ul
        aria-live="polite"
        className={`m-0 grid list-none gap-1.5 p-0 ${compact ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-4"}`}
      >
        {metrics.map((m) => {
          const sev = SEVERITY[m.severity];
          const openable = !!onOpen && (canOpen ? canOpen(m.screenCode) : true);
          const body = (
            <>
              <span className="flex items-center gap-1 text-[11px] opacity-90">
                <Icon name={sev.icon} size={14} />
                <span>{m.label}</span>
              </span>
              <span className="flex items-baseline gap-1.5">
                <span className="text-base font-black" data-testid={`kpi-chip-value-${m.key}`}>
                  {formatKpiValue(m)}
                </span>
                <span className="text-[10px] font-semibold">{sev.label}</span>
              </span>
            </>
          );
          const cls = `flex w-full flex-col rounded border border-border p-2 text-left ${sev.tone}`;
          return (
            <li key={m.key} data-testid={`kpi-chip-${m.key}`} data-severity={m.severity}>
              {openable ? (
                <button type="button" className={`${cls} cursor-pointer`} onClick={() => onOpen(m.screenCode)}>
                  {body}
                </button>
              ) : (
                <div className={cls}>{body}</div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
