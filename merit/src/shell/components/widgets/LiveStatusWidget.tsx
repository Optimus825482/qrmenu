"use client";

import { Fragment } from "react";
import { hotelKey, hotelShortName } from "@/components/ui/HotelBadge";
import type { LiveRow } from "@/modules/core/server/liveStatus";
import { kpiCellVisible, viewableScreens, type KpiCell } from "../../kpiAccess";
import { useCommandCenterKpis, affectsKpis } from "../../useCommandCenterKpis";
import { affectsLiveStatus, LIVE_STATUS_EVENT_TYPES, useLiveStatus } from "../../useLiveStatus";
import { useSse } from "../../useSse";
import { useWindowStore } from "../../windowStore";

const TRIPLE_LEGEND = "alınan / tamamlanan / bekleyen";
const SSE_TYPES: readonly string[] = [...new Set([...LIVE_STATUS_EVENT_TYPES, "session.changed", "session.closed", "notification.created"])];

/** What a number in a counter cell stands for; it picks the number's colour. */
type Role = "recv" | "done" | "wait" | "plain";
type Part = { value: number; role: Role };
type ReactCell = {
  text: string;
  warn: boolean;
  /** Counter cells: the numbers one by one, so each can carry its own colour. */
  parts?: Part[];
  /** Occupancy cells: 0-100, drawn as a small bar under the figure. */
  percent?: number;
};
type Line = { key: string; label: string; hint?: string; cells: ReactCell[]; total: ReactCell };

const PLAIN = (text: string): ReactCell => ({ text, warn: false });
const DASH: ReactCell = PLAIN("–");

const ROLE_BY_NAME: Record<string, Role> = { alınan: "recv", tamamlanan: "done", bekleyen: "wait" };

/** Roles of a row's numbers, read from its legend ("alınan / tamamlanan / bekleyen" -> recv, done, wait). */
function rolesOf(row: LiveRow): Role[] {
  return row.legend.split(" / ").map((name) => ROLE_BY_NAME[name.trim()] ?? "plain");
}

function liveCell(row: LiveRow, values: number[] | null): ReactCell {
  if (!values) return DASH;
  const pending = row.pendingIndex !== null && (values[row.pendingIndex] ?? 0) > 0;
  const roles = rolesOf(row);
  const parts = values.map((value, i): Part => ({ value, role: values.length === roles.length ? roles[i]! : "plain" }));
  return { text: values.join(" / "), warn: pending, parts };
}

/**
 * Colour band of an occupancy figure. A full house is the good case for a hotel, so the bar gets
 * stronger as it fills; a hotel well under half is shown in the muted "low" tone.
 */
export function occupancyTone(percent: number): "low" | "mid" | "high" {
  if (percent >= 85) return "high";
  if (percent >= 50) return "mid";
  return "low";
}

const percentCell = (percent: number): ReactCell => ({ text: `%${percent}`, warn: false, percent });

const ICONS: Record<string, string> = {
  online: "M8 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm-5.5 6a5.5 5.5 0 0 1 11 0Z",
  occupancy: "M2 14V9h3v5Zm4.5 0V5.5h3V14Zm4.5 0V2h3v12Z",
  rooms: "M2 13V3h1.5v5H8V5.5h3.5A2.5 2.5 0 0 1 14 8v5h-1.5v-2h-9v2Z",
  roomService: "M2 12h12v1.5H2Zm1-1.5a5 5 0 0 1 10 0ZM7.25 3h1.5v1.6h-1.5Z",
  mybar: "M3 2.5h10L8.75 8v4.5H11V14H5v-1.5h2.25V8Z",
  minibarTasks: "M3.5 2h9v12h-9Zm1.5 1.5v3h6v-3Zm0 4.5v4.5h6V8ZM6 4.2h1.2v1.6H6Zm0 4.6h1.2v2H6Z",
  qrViews: "M2 2h5v5H2Zm1.5 1.5v2h2v-2ZM9 2h5v5H9Zm1.5 1.5v2h2v-2ZM2 9h5v5H2Zm1.5 1.5v2h2v-2ZM9 9h2v2H9Zm3 0h2v2h-2Zm-3 3h2v2H9Zm3 0h2v2h-2Z",
  qrOrders: "M4 2h8v12l-2-1.2L8 14l-2-1.2L4 14Zm2 3v1.4h4V5Zm0 3v1.4h4V8Z",
  waiterCalls: "M8 2a1 1 0 0 1 1 1v.3A4.5 4.5 0 0 1 12.5 7.7V11l1.2 1.5v.5H2.3v-.5L3.5 11V7.7A4.5 4.5 0 0 1 7 3.3V3a1 1 0 0 1 1-1ZM6.5 14h3a1.5 1.5 0 0 1-3 0Z",
};

function CellView({ cell }: { cell: ReactCell }) {
  if (cell.percent !== undefined) {
    return (
      <>
        {cell.text}
        <span className="xp-widget-status-bar" data-tone={occupancyTone(cell.percent)} aria-hidden="true">
          <i style={{ width: `${Math.min(Math.max(cell.percent, 0), 100)}%` }} />
        </span>
      </>
    );
  }
  if (!cell.parts) return <>{cell.text}</>;
  return (
    <>
      {cell.parts.map((part, i) => (
        <Fragment key={i}>
          {i > 0 ? <span className="xp-widget-status-sep"> / </span> : null}
          <span data-role={part.role} data-on={part.value > 0 || undefined}>
            {part.value}
          </span>
        </Fragment>
      ))}
    </>
  );
}

const isIdle = (cell: ReactCell) => cell.text === "–" || (cell.parts !== undefined && cell.parts.every((p) => p.value === 0));

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
    const kpiLine = (cell: KpiCell | undefined, key: string, label: string, total: ReactCell, cells: ReactCell[]) => {
      if (cell !== undefined && !kpiCellVisible(cell, viewable)) return;
      lines.push({ key, label, cells, total });
    };
    kpiLine(undefined, "online", "Çevrimiçi kullanıcı", PLAIN(String(kpis.onlineUsers)), hotels.map((h) => PLAIN(String(h.online))));
    kpiLine("doluluk", "occupancy", "Doluluk", percentCell(kpis.radar.occupancyPercent), hotels.map((h) => percentCell(h.occupancyPercent)));
    kpiLine(
      "doluluk",
      "rooms",
      "Dolu oda",
      PLAIN(`${kpis.radar.occupiedRooms}/${kpis.radar.totalRooms}`),
      hotels.map((h) => PLAIN(`${h.occupiedRooms}/${h.totalRooms}`)),
    );
  }
  const kpiLineCount = lines.length;
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
      <div className="xp-widget-status-title">
        <span className="xp-widget-status-live" aria-hidden="true" />
        Anlık Durum
      </div>
      {kpis ? (
        <>
          <div className="xp-widget-status-legend">
            Bugün · <span data-role="recv">alınan</span> / <span data-role="done">tamamlanan</span> / <span data-role="wait">bekleyen</span>
          </div>
          <table>
            {split ? (
              <thead>
                <tr>
                  <td />
                  {hotels.map((h) => (
                    <th key={h.hotelId} scope="col" title={h.name}>
                      <span className="xp-widget-status-hotel" data-hotel={hotelKey(h.name) ?? "other"}>
                        {hotelShortName(h.name)}
                      </span>
                    </th>
                  ))}
                  <th scope="col" className="is-total">
                    <span className="xp-widget-status-hotel" data-hotel="total">
                      Toplam
                    </span>
                  </th>
                </tr>
              </thead>
            ) : null}
            <tbody>
              {lines.map((line, index) => (
                <tr key={line.key} data-group-start={(index === kpiLineCount && index > 0) || undefined}>
                  <th scope="row" title={line.hint}>
                    <svg className="xp-widget-status-icon" data-row={line.key} viewBox="0 0 16 16" aria-hidden="true">
                      <path d={ICONS[line.key] ?? ICONS.occupancy} fillRule="evenodd" />
                    </svg>
                    <span>{line.label}</span>
                    {line.hint && line.hint !== TRIPLE_LEGEND ? <small> {line.hint}</small> : null}
                  </th>
                  {split
                    ? line.cells.map((cell, i) => (
                        <td key={hotels[i]!.hotelId} data-warn={cell.warn || undefined} data-idle={isIdle(cell) || undefined}>
                          <CellView cell={cell} />
                        </td>
                      ))
                    : null}
                  <td className="is-total" data-warn={line.total.warn || undefined} data-idle={isIdle(line.total) || undefined}>
                    <CellView cell={line.total} />
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
