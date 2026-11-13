"use client";

import { hotelShortName } from "@/components/ui/HotelBadge";
import type { LiveRow } from "@/modules/core/server/liveStatus";
import { kpiCellVisible, viewableScreens, type KpiCell } from "../../kpiAccess";
import { useCommandCenterKpis, affectsKpis } from "../../useCommandCenterKpis";
import { affectsLiveStatus, LIVE_STATUS_EVENT_TYPES, useLiveStatus } from "../../useLiveStatus";
import { useSse } from "../../useSse";
import { useWindowStore } from "../../windowStore";

const TRIPLE_LEGEND = "alınan / tamamlanan / bekleyen";
const SSE_TYPES: readonly string[] = [...new Set([...LIVE_STATUS_EVENT_TYPES, "session.changed", "session.closed", "notification.created"])];

type Line = { key: string; label: string; hint?: string; cells: ReactCell[]; total: ReactCell };
type ReactCell = { text: string; warn: boolean };

const PLAIN = (text: string): ReactCell => ({ text, warn: false });
const DASH: ReactCell = PLAIN("–");

function liveCell(row: LiveRow, values: number[] | null): ReactCell {
  if (!values) return DASH;
  const pending = row.pendingIndex !== null && (values[row.pendingIndex] ?? 0) > 0;
  return { text: values.join(" / "), warn: pending };
}

/**
 * "Anlık Durum" desktop widget: online users and occupancy (Komuta Merkezi numbers) plus today's live
 * operational counters per hotel and in total. The counters refresh on the realtime events that change
 * them (debounced), with a 30 s poll as a safety net.
 */
export function LiveStatusWidget() {
  const { kpis, error: kpiError, scheduleRefresh: refreshKpis } = useCommandCenterKpis();
  const { status, error: liveError, scheduleRefresh: refreshLive } = useLiveStatus();
  const screensByHotel = useWindowStore((s) => s.screensByHotel);
  const viewable = viewableScreens(screensByHotel);

  useSse((e) => {
    if (affectsKpis(e.type)) refreshKpis();
    if (affectsLiveStatus(e.type)) refreshLive();
  }, SSE_TYPES);

  const hotels = kpis?.radar.byHotel ?? [];
  // One hotel in scope: its numbers are the totals, a second column would only repeat them.
  const split = hotels.length > 1;

  const lines: Line[] = [];
  if (kpis) {
    const kpiLine = (cell: KpiCell | undefined, key: string, label: string, total: string, cells: string[]) => {
      if (cell !== undefined && !kpiCellVisible(cell, viewable)) return;
      lines.push({ key, label, cells: cells.map(PLAIN), total: PLAIN(total) });
    };
    kpiLine(undefined, "online", "Çevrimiçi kullanıcı", String(kpis.onlineUsers), hotels.map((h) => String(h.online)));
    kpiLine("doluluk", "occupancy", "Doluluk", `%${kpis.radar.occupancyPercent}`, hotels.map((h) => `%${h.occupancyPercent}`));
    kpiLine(
      "doluluk",
      "rooms",
      "Dolu oda",
      `${kpis.radar.occupiedRooms}/${kpis.radar.totalRooms}`,
      hotels.map((h) => `${h.occupiedRooms}/${h.totalRooms}`),
    );
  }
  // Live rows are matched to the KPI hotel columns by id; a hotel missing from the live answer shows "–".
  for (const row of status?.rows ?? []) {
    lines.push({
      key: row.key,
      label: row.label,
      hint: row.legend,
      cells: hotels.map((h) => liveCell(row, row.byHotel[h.hotelId] ?? null)),
      total: liveCell(row, row.total),
    });
  }

  const error = kpiError ?? liveError;
  return (
    <div className="xp-widget-status">
      <div className="xp-widget-status-title">Anlık Durum</div>
      {kpis ? (
        <>
          <div className="xp-widget-status-legend">Bugün · {TRIPLE_LEGEND}</div>
          <table>
            {split ? (
              <thead>
                <tr>
                  <td />
                  {hotels.map((h) => (
                    <th key={h.hotelId} scope="col" title={h.name}>
                      {hotelShortName(h.name)}
                    </th>
                  ))}
                  <th scope="col">Toplam</th>
                </tr>
              </thead>
            ) : null}
            <tbody>
              {lines.map((line) => (
                <tr key={line.key}>
                  <th scope="row" title={line.hint}>
                    {line.label}
                    {line.hint && line.hint !== TRIPLE_LEGEND ? <small> {line.hint}</small> : null}
                  </th>
                  {split
                    ? line.cells.map((cell, i) => (
                        <td key={hotels[i]!.hotelId} data-warn={cell.warn || undefined}>
                          {cell.text}
                        </td>
                      ))
                    : null}
                  <td className="is-total" data-warn={line.total.warn || undefined}>
                    {line.total.text}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {error ? <p>{error}</p> : null}
        </>
      ) : (
        <p>{error ?? "Yükleniyor…"}</p>
      )}
    </div>
  );
}
