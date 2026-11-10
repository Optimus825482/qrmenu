"use client";

import type { CommandCenterKpis } from "@/modules/core/server/commandCenter";
import { KpiChips } from "@/modules/reporting/ui/KpiChips";
import { useRadarKpi } from "@/modules/reporting/ui/useRadarKpi";
import type { SubscribeEvents } from "./events";

type Props = {
  subscribe: SubscribeEvents;
  /** Komuta Merkezi numbers, loaded once by the shell (the home-screen widget shows them too). */
  kpis: CommandCenterKpis | null;
  error: string | null;
};

/** İzleme: the Komuta Merkezi numbers as cards (same data action as the desktop window). */
export function MonitorTab({ subscribe, kpis, error }: Props) {
  const radarKpi = useRadarKpi({ scope: "total" }, subscribe);

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
      <KpiChips
        compact
        data={radarKpi.data}
        error={radarKpi.error}
        stale={radarKpi.stale}
        choice={radarKpi.choice}
        hotels={radarKpi.hotels}
        onScopeChange={radarKpi.selectScope}
      />
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
