"use client";

import { Icon } from "@/components/icons/Icon";
import { groupAlerts } from "../alerts";
import type { RadarAlert } from "../types";

/** Chips of a pregrouped strip (three hotels, two alerts each) before the "n daha" note. */
const PREGROUPED_MAX = 6;

export type AlertStripProps = {
  alerts: RadarAlert[];
  onFocus?(alert: RadarAlert): void;
  /** The list is already grouped and ordered (the whole complex groups per hotel): show it as it is. */
  pregrouped?: boolean;
};

/** Top alert strip (spec 2.2: up to 5 grouped alerts + "n daha", Kritik > Dikkat). */
export function AlertStrip({ alerts, onFocus, pregrouped }: AlertStripProps) {
  if (alerts.length === 0) return null;
  const { shown, more } = pregrouped
    ? { shown: alerts.slice(0, PREGROUPED_MAX), more: Math.max(0, alerts.length - PREGROUPED_MAX) }
    : groupAlerts(alerts, 5);
  return (
    <div className="rd-alert-strip" role="region" aria-label="Uyarı şeridi">
      <ul className="rd-alert-strip-list">
        {shown.map((a) => {
          const crit = a.severity === "crit";
          const inner = (
            <>
              <Icon name={crit ? "error" : "warning"} size={14} />
              <span>
                <strong>{crit ? "Kritik" : "Dikkat"}:</strong> {a.text}
              </span>
            </>
          );
          return (
            <li key={a.key}>
              {onFocus ? (
                <button
                  type="button"
                  className="rd-alert-chip"
                  data-tone={crit ? "danger" : "warn"}
                  onClick={() => onFocus(a)}
                >
                  {inner}
                </button>
              ) : (
                <span className="rd-alert-chip" data-tone={crit ? "danger" : "warn"}>
                  {inner}
                </span>
              )}
            </li>
          );
        })}
      </ul>
      {more > 0 ? <span className="rd-alert-more">{more} daha</span> : null}
    </div>
  );
}
