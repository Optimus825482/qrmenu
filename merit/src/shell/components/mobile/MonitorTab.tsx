"use client";

import { useEffect } from "react";
import { affectsKpis, useCommandCenterKpis } from "../../useCommandCenterKpis";
import type { SubscribeEvents } from "./events";

/** İzleme: the Komuta Merkezi numbers as cards (same data action as the desktop window). */
export function MonitorTab({ subscribe }: { subscribe: SubscribeEvents }) {
  const { kpis, error, scheduleRefresh } = useCommandCenterKpis();

  useEffect(
    () =>
      subscribe((e) => {
        if (affectsKpis(e.type)) scheduleRefresh();
      }),
    [subscribe, scheduleRefresh],
  );

  return (
    <div className="mb-stack">
      <h2 className="mb-heading">Genel Durum</h2>
      {error ? (
        <div className="mb-error" role="alert">
          {error}
        </div>
      ) : null}
      <div className="mb-kpis">
        <div className="mb-card mb-kpi" data-testid="kpi-hotels">
          <span className="mb-kpi-value">{kpis?.hotels ?? "—"}</span>
          <span className="mb-kpi-label">Otel</span>
        </div>
        <div className="mb-card mb-kpi" data-testid="kpi-online">
          <span className="mb-kpi-value">{kpis?.onlineUsers ?? "—"}</span>
          <span className="mb-kpi-label">Online kullanıcı</span>
        </div>
        <div className="mb-card mb-kpi" data-testid="kpi-notifications">
          <span className="mb-kpi-value">{kpis?.notificationsToday ?? "—"}</span>
          <span className="mb-kpi-label">Bugünkü bildirim</span>
        </div>
      </div>
      <section className="mb-card" aria-labelledby="mb-online-by-hotel">
        <h3 className="mb-subheading" id="mb-online-by-hotel">
          Otellere göre online
        </h3>
        <ul className="mb-rows">
          {kpis?.openSessionsByHotel.map((h) => (
            <li key={h.hotelId}>
              <span>{h.name}</span>
              <span className="mb-count">{h.online}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
