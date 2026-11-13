"use client";

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { hotelKey, hotelShortName } from "@/components/ui/HotelBadge";
import type {
  DetailHotel,
  FlowHotel,
  FlowSegment,
  LiveDetail,
  LiveDetailKind,
  OccupancyDetailHotel,
  OnlineDetailRow,
  RoomsDetailHotel,
} from "@/modules/core/server/liveStatusDetail";
import { liveStatusDetailAction } from "@/modules/core/server/liveStatusDetailAction";

const TZ = "Europe/Nicosia";
const REFRESH_MS = 30_000;

export const DETAIL_TITLES: Record<LiveDetailKind, string> = {
  online: "Çevrimiçi Kullanıcılar",
  occupancy: "Doluluk Detayı",
  rooms: "Kat Kat Doluluk",
  roomService: "Oda Servisi Talepleri · Bugün",
  mybar: "MyBar Talepleri · Bugün",
  minibarTasks: "Minibar Görevleri · Bugün",
};

/** Rows of the widget that open a dialog (the others stay plain numbers). */
export const isDetailKind = (key: string): key is LiveDetailKind => key in DETAIL_TITLES;

const clock = (iso: string) => new Date(iso).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", timeZone: TZ });
const dayOf = (iso: string) => new Date(iso).toLocaleDateString("tr-TR", { day: "2-digit", month: "2-digit", timeZone: TZ });

/** "az önce", "12 dk", "3 sa 05 dk", "2 gün 4 sa". */
export function durationText(ms: number): string {
  const min = Math.max(0, Math.floor(ms / 60_000));
  if (min < 1) return "az önce";
  if (min < 60) return `${min} dk`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `${hours} sa ${String(min % 60).padStart(2, "0")} dk`;
  return `${Math.floor(hours / 24)} gün ${hours % 24} sa`;
}

const tone = (percent: number) => (percent >= 85 ? "high" : percent >= 50 ? "mid" : "low");
const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);

/** Hotel logo from the brand set; a hotel outside the three keeps its name as a badge. */
function HotelMark({ hotel, size = 44 }: { hotel: DetailHotel; size?: number }) {
  const key = hotelKey(hotel.name) ?? hotelKey(hotel.code);
  if (!key) return <span className="xp-widget-status-hotel">{hotelShortName(hotel.name)}</span>;
  // eslint-disable-next-line @next/next/no-img-element -- small static brand mark
  return <img className="xp-live-logo" src={`/brand/hotels/${key}-transparent.webp`} alt="" width={size} height={size} />;
}

function HotelHead({ hotel, children }: { hotel: DetailHotel; children?: ReactNode }) {
  return (
    <header className="xp-live-head">
      <HotelMark hotel={hotel} />
      <div>
        <strong>{hotel.name}</strong>
        {children}
      </div>
    </header>
  );
}

function Meter({ percent, label }: { percent: number; label: string }) {
  return (
    <span className="xp-live-meter" data-tone={tone(percent)} role="img" aria-label={label}>
      <i style={{ width: `${Math.min(Math.max(percent, 0), 100)}%` }} />
    </span>
  );
}

function OnlineView({ rows, hiddenHotels, now }: { rows: OnlineDetailRow[]; hiddenHotels: number; now: number }) {
  return (
    <>
      {rows.length === 0 ? (
        <p className="xp-live-empty">Şu anda görebileceğiniz açık oturum yok.</p>
      ) : (
        <table className="xp-live-table">
          <thead>
            <tr>
              <th scope="col">Kullanıcı</th>
              <th scope="col">Otel</th>
              <th scope="col">Giriş</th>
              <th scope="col">Çevrimiçi süre</th>
              <th scope="col">Son hareket</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const idleMs = now - Date.parse(r.lastSeenAt);
              const place = [r.outletName, r.deviceLabel].filter(Boolean).join(" · ");
              return (
                <tr key={r.id}>
                  <th scope="row">
                    <span className="xp-live-dot" data-status={r.status} title={r.status === "UYARI" ? "Süre uyarısı verildi" : "Çevrimiçi"} />
                    <span>
                      <strong>{r.fullName}</strong>
                      <small>{[r.roleName, place].filter(Boolean).join(" · ")}</small>
                    </span>
                  </th>
                  <td>
                    <span className="xp-widget-status-hotel" data-hotel={hotelKey(r.hotelName) ?? "other"}>
                      {hotelShortName(r.hotelName)}
                    </span>
                  </td>
                  <td>
                    {clock(r.loginAt)}
                    {dayOf(r.loginAt) !== dayOf(new Date(now).toISOString()) ? <small>{dayOf(r.loginAt)}</small> : null}
                  </td>
                  <td>{durationText(now - Date.parse(r.loginAt))}</td>
                  <td>
                    {idleMs < 60_000 ? "az önce" : `${durationText(idleMs)} önce`}
                    <small>{clock(r.lastSeenAt)}</small>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {hiddenHotels > 0 ? (
        <p className="xp-live-note">{hiddenHotels} otelin oturum listesi için “Çevrimiçi Kullanıcılar” ekran yetkisi gerekir; o oteller burada yok.</p>
      ) : null}
    </>
  );
}

function OccupancyView({ hotels }: { hotels: OccupancyDetailHotel[] }) {
  const total = hotels.reduce((n, h) => n + h.totalRooms, 0);
  const occupied = hotels.reduce((n, h) => n + h.occupiedRooms, 0);
  return (
    <div className="xp-live-stack">
      {hotels.map((h) => (
        <section key={h.hotelId} className="xp-live-occ">
          <HotelMark hotel={h} size={56} />
          <div className="xp-live-occ-main">
            <strong>{h.name}</strong>
            <Meter percent={h.percent} label={`Doluluk yüzde ${h.percent}`} />
            <dl>
              <div><dt>Dolu</dt><dd>{h.occupiedRooms}</dd></div>
              <div><dt>Boş</dt><dd>{h.totalRooms - h.occupiedRooms}</dd></div>
              <div><dt>Toplam oda</dt><dd>{h.totalRooms}</dd></div>
              <div><dt>Bugün giriş</dt><dd>{h.arrivals}</dd></div>
              <div><dt>Bugün çıkış</dt><dd>{h.departures}</dd></div>
            </dl>
          </div>
          <b className="xp-live-occ-pct" data-tone={tone(h.percent)}>%{h.percent}</b>
        </section>
      ))}
      {hotels.length > 1 ? (
        <p className="xp-live-total">
          Toplam <b>{occupied}/{total}</b> oda dolu · <b>%{pct(occupied, total)}</b>
        </p>
      ) : null}
    </div>
  );
}

function RoomsView({ hotels }: { hotels: RoomsDetailHotel[] }) {
  return (
    <div className="xp-live-cols">
      {hotels.map((h) => (
        <section key={h.hotelId}>
          <HotelHead hotel={h}>
            <span>{h.occupiedRooms}/{h.totalRooms} oda · %{pct(h.occupiedRooms, h.totalRooms)}</span>
          </HotelHead>
          {h.floors.length === 0 ? <p className="xp-live-empty">Tanımlı oda yok.</p> : null}
          <ol className="xp-live-floors">
            {h.floors.map((f) => {
              const p = pct(f.occupied, f.total);
              return (
                <li key={f.floorId}>
                  <span className="xp-live-floor-name" title={f.name}>{f.name}</span>
                  <Meter percent={p} label={`${f.name}: ${f.total} odanın ${f.occupied} tanesi dolu`} />
                  <span className="xp-live-floor-num">{f.occupied}/{f.total}</span>
                </li>
              );
            })}
          </ol>
        </section>
      ))}
    </div>
  );
}

function SegmentBar({ segments, total }: { segments: FlowSegment[]; total: number }) {
  const summary = segments.map((s) => `${s.label} ${s.value}`).join(", ");
  return (
    <>
      <div className="xp-live-segbar" role="img" aria-label={summary}>
        {total === 0 ? null : segments.filter((s) => s.value > 0).map((s) => <i key={s.key} data-tone={s.tone} style={{ flexGrow: s.value }} />)}
      </div>
      <ul className="xp-live-legend">
        {segments.map((s) => (
          <li key={s.key} data-zero={s.value === 0 || undefined}>
            <i data-tone={s.tone} />
            <span>{s.label}</span>
            <b>{s.value}</b>
          </li>
        ))}
      </ul>
    </>
  );
}

function Hourly({ values, max, label }: { values: number[]; max: number; label: string }) {
  const peak = values.reduce((best, v, hour) => (v > values[best]! ? hour : best), 0);
  const sum = values.reduce((a, b) => a + b, 0);
  const summary = sum === 0 ? `${label}: bugün kayıt yok` : `${label}: en yoğun saat ${String(peak).padStart(2, "0")}:00, ${values[peak]} adet`;
  return (
    <figure className="xp-live-hourly">
      <figcaption>{label}</figcaption>
      <div role="img" aria-label={summary}>
        {values.map((v, hour) => (
          <i key={hour} data-on={v > 0 || undefined} title={`${String(hour).padStart(2, "0")}:00 · ${v}`} style={{ height: `${max > 0 ? Math.max((v / max) * 100, v > 0 ? 8 : 0) : 0}%` }} />
        ))}
      </div>
      <div className="xp-live-hourly-axis" aria-hidden="true">
        <span>00</span><span>06</span><span>12</span><span>18</span><span>23</span>
      </div>
    </figure>
  );
}

function FlowView({ detail }: { detail: Extract<LiveDetail, { hotels: FlowHotel[] }> }) {
  // One scale for every hotel, so the columns can be compared at a glance.
  const max = Math.max(0, ...detail.hotels.flatMap((h) => h.hourly));
  const noun = detail.kind === "minibarTasks" ? "görev" : "talep";
  return (
    <div className="xp-live-cols">
      {detail.hotels.map((h) => (
        <section key={h.hotelId}>
          <HotelHead hotel={h}>
            <span><b>{h.total}</b> {noun}</span>
          </HotelHead>
          <SegmentBar segments={h.segments} total={h.total} />
          <Hourly values={h.hourly} max={max} label={detail.hourlyLabel} />
          {detail.kind === "roomService" ? (
            <p className="xp-live-note">
              Ortalama teslim: <b>{h.avgMinutes === null ? "–" : `${h.avgMinutes} dk`}</b>
              {h.carried > 0 ? ` · ${h.carried} talep gece yarısından önce alındı` : ""}
            </p>
          ) : null}
          {h.floors.length > 0 ? (
            <ol className="xp-live-floors">
              {h.floors.map((f) => (
                <li key={f.floorId}>
                  <span className="xp-live-floor-name" title={f.name}>{f.name}</span>
                  <Meter percent={pct(f.done, f.total)} label={`${f.name}: ${f.total} görevin ${f.done} tanesi tamamlandı`} />
                  <span className="xp-live-floor-num">{f.done}/{f.total}</span>
                </li>
              ))}
            </ol>
          ) : null}
        </section>
      ))}
    </div>
  );
}

function Body({ detail, now }: { detail: LiveDetail; now: number }) {
  if (detail.kind === "online") return <OnlineView rows={detail.rows} hiddenHotels={detail.hiddenHotels} now={now} />;
  if (detail.hotels.length === 0) return <p className="xp-live-empty">Bu bilgiyi görme yetkiniz olan otel yok.</p>;
  if (detail.kind === "occupancy") return <OccupancyView hotels={detail.hotels} />;
  if (detail.kind === "rooms") return <RoomsView hotels={detail.hotels} />;
  return <FlowView detail={detail} />;
}

/**
 * Dialog behind a row of the "Anlık Durum" widget. Loads on open and every 30 s while it stays open.
 * Portaled above the shell windows; closes on Esc, the × button, "Kapat" or a click on the backdrop.
 */
export function LiveDetailDialog({ kind, onClose }: { kind: LiveDetailKind; onClose(): void }) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const [detail, setDetail] = useState<LiveDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    try {
      const result = await liveStatusDetailAction(kind);
      if (result.ok) {
        setDetail(result.data);
        setError(null);
      } else {
        setError(result.error.message);
      }
    } catch {
      setError("Veriler alınamadı");
    }
    setNow(Date.now());
  }, [kind]);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const first = setTimeout(() => void load(), 0);
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, REFRESH_MS);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
      document.removeEventListener("keydown", onKey);
      if (previous?.isConnected) previous.focus();
    };
  }, [load, onClose]);

  const root = typeof document === "undefined" ? null : (document.getElementById("xp-dialog-root") ?? document.body);
  if (!root) return null;
  // React events bubble through the portal to the widget frame: keep its drag and context menu out of the dialog.
  const stop = (e: { stopPropagation(): void }) => e.stopPropagation();
  return createPortal(
    <div
      className="xp-modal-backdrop"
      onPointerDown={(e) => {
        e.stopPropagation();
        if (e.target === e.currentTarget) onClose();
      }}
      onContextMenu={stop}
      onClick={stop}
    >
      <div role="dialog" aria-modal="true" aria-labelledby={titleId} className="xp-window xp-dialog xp-live-detail" data-kind={kind}>
        <div className="xp-titlebar">
          <span id={titleId} className="xp-titlebar-text">
            {DETAIL_TITLES[kind]}
          </span>
          <button type="button" aria-label="Kapat" className="xp-title-button is-close" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="xp-live-body" aria-live="polite">
          {detail ? <Body detail={detail} now={now} /> : <p className="xp-live-empty">{error ?? "Yükleniyor…"}</p>}
          {detail && error ? <p role="alert" className="xp-live-note">{error}</p> : null}
        </div>
        <div className="xp-dialog-actions">
          {detail ? <span className="xp-live-stamp">Güncellendi: {clock(detail.generatedAt)}</span> : null}
          <button type="button" className="xp-button" onClick={() => void load()}>
            Yenile
          </button>
          <button type="button" className="xp-button" ref={closeRef} onClick={onClose}>
            Kapat
          </button>
        </div>
      </div>
    </div>,
    root,
  );
}
