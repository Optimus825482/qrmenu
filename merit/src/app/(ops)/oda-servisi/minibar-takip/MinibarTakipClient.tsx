"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/icons/Icon";
import { getFloorWatchAction } from "@/modules/minibar/server/actions/floorWatch";
import type { FloorWatch } from "@/modules/minibar/server/floorWatch";
import { roomCellModel, type RoomCell, type Tone } from "@/modules/radar/labels";
import { useSse } from "@/shell/useSse";
import "./minibar-takip.css";

/** Minibar events that change a cell. Only the session hotel's reach this tab; the timer covers the other hotels. */
const LIVE_EVENTS = [
  "roomcheck.done",
  "dnd.marked",
  "dnd.completed",
  "dnd.missed",
  "task.updated",
  "task.generated",
  "occupancy.uploaded",
  "mybar.created",
  "mybar.seen",
  "mybar.fulfilled",
  "mybar.completed",
  "mybar.cancelled",
  "realtime.resync",
] as const;

const POLL_MS = 15_000;
const REFRESH_DEBOUNCE_MS = 400;
const CONN_ERROR = "Bağlantı kurulamadı. Son bilinen durum gösteriliyor.";

const CHECK_LABELS: Record<NonNullable<RoomCell["checkedToday"]>["type"], string> = {
  URUN_EKLENDI: "Ürün eklendi",
  SARFIYAT_YOK: "Sarfiyat yok",
  DND: "DND",
  ACIK: "Açık",
};

type LegendItem = { tone: Tone; edge?: "dashed"; badge?: string; text: string };

/** Same wording as the "Kat" legend of the Komuta Merkezi (radar Legend). */
const LEGEND: LegendItem[] = [
  { tone: "muted", text: "Dolu oda (düz kenar) · Görev yok" },
  { tone: "muted", edge: "dashed", text: "Boş oda (kesik kenar)" },
  { tone: "warn", badge: "M12", text: "Görev bekliyor · MyBar dakika" },
  { tone: "info", badge: "D1/2", text: "Görev sürüyor · DND kontrol sayısı" },
  { tone: "success", badge: "check", text: "Tamamlandı / bugün kontrol edildi" },
  { tone: "danger", text: "Eksik görev veya eksik DND" },
];

const clock = (iso: string, seconds = false) =>
  new Intl.DateTimeFormat("tr-TR", {
    timeZone: "Europe/Nicosia",
    hour: "2-digit",
    minute: "2-digit",
    ...(seconds ? { second: "2-digit" } : {}),
  }).format(new Date(iso));

const dayTr = (day: string) => day.split("-").reverse().join(".");

function Cell({ room, now, selected, onSelect }: { room: RoomCell; now: number; selected: boolean; onSelect(): void }) {
  const m = roomCellModel(room, now);
  return (
    <button
      type="button"
      className="mbt-cell"
      data-tone={m.tone}
      data-edge={m.edge}
      data-room-id={room.roomId}
      aria-label={m.ariaLabel}
      aria-pressed={selected}
      onClick={onSelect}
    >
      <span>{room.number}</span>
      {m.corner.length > 0 ? <span className="mbt-corner" aria-hidden="true" data-marks={m.corner.join(" ")} /> : null}
      {m.checked ? (
        <span className="mbt-tick" aria-hidden="true">
          <Icon name="check" size={13} />
        </span>
      ) : null}
    </button>
  );
}

function RoomDetail({
  room,
  floorName,
  people,
  now,
  onClose,
}: {
  room: RoomCell;
  floorName: string;
  people: Record<string, string>;
  now: number;
  onClose(): void;
}) {
  const m = roomCellModel(room, now);
  const check = room.checkedToday;
  return (
    <section
      aria-label={`Oda ${room.number} ayrıntısı`}
      data-testid="mbt-detail"
      className="mbt-detail rounded-2xl border-2 border-accent bg-surface p-4"
    >
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-lg font-black text-text">{`Oda ${room.number} · ${floorName}`}</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Ayrıntıyı kapat"
          className="flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-border text-text"
        >
          <Icon name="close" size={18} />
        </button>
      </div>
      <p className="mt-1 text-[13px] font-semibold text-muted">{m.ariaLabel.slice(room.number.length + 2)}</p>

      {check ? (
        <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm text-text">
          <dt className="font-semibold text-muted">Kontrol saati</dt>
          <dd className="font-black" data-testid="mbt-check-time">{clock(check.at)}</dd>
          <dt className="font-semibold text-muted">Kontrol eden</dt>
          <dd className="font-black" data-testid="mbt-check-user">{people[check.userId] ?? "Bilinmiyor"}</dd>
          <dt className="font-semibold text-muted">Sonuç</dt>
          <dd className="font-bold">{CHECK_LABELS[check.type]}</dd>
        </dl>
      ) : (
        <p className="mt-3 text-sm font-semibold text-muted">Bugün kontrol edilmedi.</p>
      )}

      {room.dnd ? (
        <p className="mt-2 text-sm text-text">
          {`DND kontrolü ${room.dnd.count}/${room.dnd.minChecks} · son ${clock(room.dnd.lastAt)}`}
        </p>
      ) : null}
      {room.mybar ? (
        <p className="mt-2 text-sm text-text">
          {`MyBar talebi ${room.mybar.seen ? "onaylandı, tamamlanmayı bekliyor" : "onay bekliyor"} · ${clock(room.mybar.since)}`}
        </p>
      ) : null}
    </section>
  );
}

export default function MinibarTakipClient({ initial, loadError }: { initial: FloorWatch | null; loadError: string | null }) {
  const [data, setData] = useState(initial);
  const [error, setError] = useState(loadError ?? "");
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [now, setNow] = useState(() => (initial ? Date.parse(initial.at) : Date.now()));

  const hotelId = data?.hotel.id ?? "";
  // Latest request wins: a slow answer for the hotel shown before must not overwrite the one picked after it.
  const requestNo = useRef(0);

  const load = useCallback(async (target: string, visible = false) => {
    if (!target) return;
    const mine = ++requestNo.current;
    if (visible) setBusy(true);
    try {
      const res = await getFloorWatchAction(target);
      if (mine !== requestNo.current) return;
      if (res.ok) {
        setData(res.data);
        setNow(Date.parse(res.data.at));
        setError("");
      } else {
        setError(res.error.message);
      }
    } catch {
      if (mine === requestNo.current) setError(CONN_ERROR);
    } finally {
      if (mine === requestNo.current) setBusy(false);
    }
  }, []);

  const refreshTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(refreshTimer.current), []);
  const scheduleRefresh = useCallback(
    (immediate = false) => {
      window.clearTimeout(refreshTimer.current);
      refreshTimer.current = window.setTimeout(() => void load(hotelId), immediate ? 0 : REFRESH_DEBOUNCE_MS);
    },
    [load, hotelId],
  );

  useSse((event) => {
    if (event.type !== "realtime.resync" && event.hotelId && event.hotelId !== hotelId) return;
    scheduleRefresh(event.type === "realtime.resync");
  }, LIVE_EVENTS);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void load(hotelId);
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [load, hotelId]);

  // A tablet that slept or lost the network: refetch when it is back.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") scheduleRefresh(true);
    };
    const onOnline = () => scheduleRefresh(true);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
    };
  }, [scheduleRefresh]);

  const pickHotel = (id: string) => {
    const next = data?.hotels.find((h) => h.id === id);
    if (!next) return;
    setSelected(null);
    const url = new URL(window.location.href);
    url.searchParams.set("otel", next.code);
    window.history.replaceState(null, "", url);
    void load(next.id, true);
  };

  const rooms = useMemo(() => (data ? data.floors.flatMap((f) => f.rooms.map((room) => ({ room, floorName: f.name }))) : []), [data]);
  const stats = useMemo(() => {
    let checked = 0;
    let waiting = 0;
    let dnd = 0;
    for (const { room } of rooms) {
      if (room.checkedToday) checked++;
      if (room.task?.status === "BEKLIYOR") waiting++;
      if (room.dnd && (room.dnd.status === "AKTIF" || room.dnd.status === "EKSIK")) dnd++;
    }
    return { checked, waiting, dnd, total: rooms.length };
  }, [rooms]);
  const open = selected ? rooms.find((x) => x.room.roomId === selected) : undefined;

  return (
    <section aria-label="Minibar takip" className="mbt space-y-4">
      <div className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h1 className="flex flex-wrap items-center gap-2 text-xl font-black tracking-tight text-text">
            <Icon name="minibar" size={20} />
            <span>Minibar Takip</span>
            {data ? (
              <span className="rounded-full border border-accent px-2 py-0.5 text-[13px] font-bold text-accent">{data.hotel.name}</span>
            ) : null}
          </h1>
          {data ? (
            <p role="status" className="text-[13px] font-semibold text-muted" data-testid="mbt-updated">
              {`${dayTr(data.day)} · Son güncelleme ${clock(data.at, true)}`}
            </p>
          ) : null}
        </div>

        {data ? (
          <div className="mt-3 flex flex-wrap items-end gap-3" data-guide="mbt-otel">
            <label className="flex flex-col gap-1 text-[13px] font-semibold text-muted">
              <span>Otel</span>
              <select
                value={data.hotel.id}
                onChange={(e) => pickHotel(e.target.value)}
                disabled={busy || data.hotels.length < 2}
                className="min-h-11 rounded-xl border border-border bg-surface px-3 text-base font-bold text-text"
              >
                {data.hotels.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.name}
                  </option>
                ))}
              </select>
            </label>
            <ul className="flex flex-wrap gap-2 text-[13px] font-bold text-text" aria-label="Özet">
              <li className="rounded-xl border border-border px-3 py-2" data-testid="mbt-stat-checked">{`Kontrol edilen ${stats.checked}/${stats.total}`}</li>
              <li className="rounded-xl border border-border px-3 py-2">{`Görev bekleyen ${stats.waiting}`}</li>
              <li className="rounded-xl border border-border px-3 py-2">{`DND ${stats.dnd}`}</li>
            </ul>
          </div>
        ) : null}
      </div>

      {error ? (
        <p role="alert" className="rounded-xl border border-danger/30 bg-danger/10 p-3 text-sm font-semibold text-danger">
          {error}
        </p>
      ) : null}

      {data ? (
        <>
          <div className="mbt-layout">
            <div className="rounded-2xl border border-border bg-surface p-4" data-guide="mbt-kat" aria-busy={busy}>
              {rooms.length === 0 ? (
                <p className="p-6 text-center text-[13px] text-muted">Bu otelde oda tanımlı değil.</p>
              ) : (
                <div className="mbt-grid">
                  {data.floors.map((f) => (
                    <div key={f.floorId} className="mbt-row" role="group" aria-label={f.name}>
                      <div className="mbt-floor-name text-text">{f.name}</div>
                      <div className="mbt-cells">
                        {f.rooms.map((r) => (
                          <Cell
                            key={r.roomId}
                            room={r}
                            now={now}
                            selected={r.roomId === selected}
                            onSelect={() => setSelected((cur) => (cur === r.roomId ? null : r.roomId))}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="mbt-side" data-guide="mbt-ayrinti">
              {open ? (
                <RoomDetail room={open.room} floorName={open.floorName} people={data.people} now={now} onClose={() => setSelected(null)} />
              ) : (
                <p className="mbt-hint rounded-2xl border border-dashed border-border p-4 text-[13px] text-muted">
                  Kontrol saatini ve kontrol eden personeli görmek için bir odaya dokunun.
                </p>
              )}

              <section aria-label="Kontrol eden personel" className="rounded-2xl border border-border bg-surface p-4">
                <h2 className="text-sm font-black text-text">Kontrol eden personel</h2>
                {data.staff.length === 0 ? (
                  <p className="mt-2 text-[13px] text-muted">Bugün henüz oda kontrol edilmedi.</p>
                ) : (
                  <ul className="mt-2 space-y-3">
                    {data.staff.map((s) => {
                      const pct = s.total > 0 ? Math.round((s.done / s.total) * 100) : 0;
                      const name = data.people[s.userId] ?? "Bilinmiyor";
                      return (
                        <li key={s.userId} className="text-sm text-text">
                          <div className="flex items-baseline justify-between gap-2">
                            <span className="font-bold">{name}</span>
                            <span className="font-semibold">{`${s.done}/${s.total}`}</span>
                          </div>
                          <div className="mbt-bar mt-1" role="img" aria-label={`${name}: ${s.done}/${s.total} görev, yüzde ${pct}`}>
                            <span style={{ width: `${pct}%` }} />
                          </div>
                          {s.lastAt ? <span className="text-[13px] text-muted">{`Son işlem ${clock(s.lastAt)}`}</span> : null}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            </div>
          </div>

          <section aria-label="Açıklama" className="rounded-2xl border border-border bg-surface p-4">
            <h2 className="mb-2 text-sm font-black text-text">Açıklama</h2>
            <ul className="mbt-legend text-text">
              {LEGEND.map((item) => (
                <li key={item.text} data-tone={item.tone}>
                  <span className="mbt-swatch" data-edge={item.edge ?? "solid"} aria-hidden="true">
                    {item.badge === "check" ? <Icon name="check" size={11} /> : (item.badge ?? null)}
                  </span>
                  <span>{item.text}</span>
                </li>
              ))}
            </ul>
          </section>
        </>
      ) : null}
    </section>
  );
}
