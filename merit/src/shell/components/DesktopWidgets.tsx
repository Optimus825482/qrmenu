"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { hotelShortName } from "@/components/ui/HotelBadge";
import { NOTE_MAX, type WidgetId, type WidgetPos } from "../types";
import { useCommandCenterKpis } from "../useCommandCenterKpis";
import { WIDGETS, widgetPosition, type WidgetDef } from "../widgets";
import { deskHeight, effectiveViewport, useWindowStore, windowStore } from "../windowStore";

/** Pointer travel (px) before a press on a widget becomes a drag. */
const DRAG_THRESHOLD = 4;

/** The current time, re-read every `everyMs`. */
function useNow(everyMs: number): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), everyMs);
    return () => clearInterval(timer);
  }, [everyMs]);
  return now;
}

const TR = "tr-TR";
const monthName = (d: Date) => d.toLocaleDateString(TR, { month: "long" });
const weekdayName = (d: Date) => d.toLocaleDateString(TR, { weekday: "long" });
const dayOfYear = (d: Date) => Math.round((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(d.getFullYear(), 0, 0)) / 86_400_000);

// --- contents -------------------------------------------------------------------------------------

function AnalogClock() {
  const now = useNow(1000);
  const s = now.getSeconds();
  const m = now.getMinutes() + s / 60;
  const h = (now.getHours() % 12) + m / 60;
  const hand = (deg: number, length: number, width: number, color: string) => (
    <line
      x1="50"
      y1="50"
      x2={50 + length * Math.sin((deg * Math.PI) / 180)}
      y2={50 - length * Math.cos((deg * Math.PI) / 180)}
      stroke={color}
      strokeWidth={width}
      strokeLinecap="round"
    />
  );
  return (
    <div className="xp-widget-clock">
      <svg viewBox="0 0 100 100" role="img" aria-label={`Saat ${now.toLocaleTimeString(TR, { hour: "2-digit", minute: "2-digit" })}`}>
        <circle cx="50" cy="50" r="48" className="xp-widget-clock-rim" />
        <circle cx="50" cy="50" r="43" className="xp-widget-clock-face" />
        {Array.from({ length: 60 }, (_, i) => {
          const major = i % 5 === 0;
          const a = (i * 6 * Math.PI) / 180;
          const r1 = major ? 36 : 39.5;
          return (
            <line
              key={i}
              x1={50 + r1 * Math.sin(a)}
              y1={50 - r1 * Math.cos(a)}
              x2={50 + 41.5 * Math.sin(a)}
              y2={50 - 41.5 * Math.cos(a)}
              className={major ? "xp-widget-clock-tick is-major" : "xp-widget-clock-tick"}
            />
          );
        })}
        {[12, 3, 6, 9].map((n) => {
          const a = (n * 30 * Math.PI) / 180;
          return (
            <text key={n} x={50 + 29 * Math.sin(a)} y={50 - 29 * Math.cos(a) + 3.6} textAnchor="middle" className="xp-widget-clock-num">
              {n}
            </text>
          );
        })}
        {hand(h * 30, 22, 3.4, "#1b2a4a")}
        {hand(m * 6, 33, 2.2, "#1b2a4a")}
        {hand(s * 6, 36, 0.9, "#c0392b")}
        <circle cx="50" cy="50" r="2.6" fill="#c0392b" />
      </svg>
      <div className="xp-widget-clock-text">{now.toLocaleTimeString(TR, { hour: "2-digit", minute: "2-digit" })}</div>
    </div>
  );
}

function LeafCalendar() {
  const now = useNow(30_000);
  return (
    <div className="xp-widget-leaf">
      <div className="xp-widget-leaf-rings" aria-hidden="true">
        <span />
        <span />
      </div>
      <div className="xp-widget-leaf-head">
        {monthName(now)} {now.getFullYear()}
      </div>
      <div className="xp-widget-leaf-day">{now.getDate()}</div>
      <div className="xp-widget-leaf-weekday">{weekdayName(now)}</div>
      <div className="xp-widget-leaf-foot">Yılın {dayOfYear(now)}. günü</div>
    </div>
  );
}

function MonthCalendar() {
  const now = useNow(60_000);
  const year = now.getFullYear();
  const month = now.getMonth();
  const lead = (new Date(year, month, 1).getDay() + 6) % 7; // Monday first
  const days = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [...Array.from({ length: lead }, () => null), ...Array.from({ length: days }, (_, i) => i + 1)];
  return (
    <div className="xp-widget-month">
      <div className="xp-widget-month-head">
        {monthName(now)} {year}
      </div>
      <div className="xp-widget-month-grid" role="grid" aria-label={`${monthName(now)} ${year}`}>
        {["Pt", "Sa", "Ça", "Pe", "Cu", "Ct", "Pz"].map((d, i) => (
          <span key={d} className="xp-widget-month-dow" data-weekend={i > 4}>
            {d}
          </span>
        ))}
        {cells.map((day, i) => (
          <span
            key={i}
            className="xp-widget-month-day"
            data-today={day === now.getDate()}
            data-weekend={i % 7 > 4}
            aria-current={day === now.getDate() ? "date" : undefined}
          >
            {day ?? ""}
          </span>
        ))}
      </div>
    </div>
  );
}

function DigitalClock() {
  const now = useNow(1000);
  return (
    <div className="xp-widget-digital">
      <div className="xp-widget-digital-time">{now.toLocaleTimeString(TR, { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</div>
      <div className="xp-widget-digital-date">{now.toLocaleDateString(TR, { day: "numeric", month: "long", year: "numeric", weekday: "long" })}</div>
    </div>
  );
}

function NoteWidget() {
  const note = useWindowStore((s) => s.note);
  const id = useId();
  return (
    <div className="xp-widget-note">
      <label htmlFor={id} className="xp-widget-note-title">
        Notlarım
      </label>
      <textarea
        id={id}
        value={note}
        maxLength={NOTE_MAX}
        placeholder="Buraya yazın…"
        onChange={(e) => windowStore.getState().setNote(e.target.value)}
      />
    </div>
  );
}

function StatusWidget() {
  const { kpis, error } = useCommandCenterKpis();
  const hotels = kpis?.radar.byHotel ?? [];
  // One hotel in scope: its numbers are the totals, a second column would only repeat them.
  const split = hotels.length > 1;
  const rows: { label: string; total: string; cells: string[] }[] = kpis
    ? [
        { label: "Çevrimiçi kullanıcı", total: String(kpis.onlineUsers), cells: hotels.map((h) => String(h.online)) },
        {
          label: "Doluluk",
          total: `%${kpis.radar.occupancyPercent}`,
          cells: hotels.map((h) => `%${h.occupancyPercent}`),
        },
        {
          label: "Dolu oda",
          total: `${kpis.radar.occupiedRooms}/${kpis.radar.totalRooms}`,
          cells: hotels.map((h) => `${h.occupiedRooms}/${h.totalRooms}`),
        },
        {
          label: "Açık MyBar talebi",
          total: String(kpis.radar.activeMybarRequests),
          cells: hotels.map((h) => String(h.activeMybarRequests)),
        },
        {
          label: "Geciken oda siparişi",
          total: String(kpis.radar.delayedRoomOrders),
          cells: hotels.map((h) => String(h.delayedRoomOrders)),
        },
        {
          label: "Bekleyen sipariş",
          total: String(kpis.radar.pendingPosOrders),
          cells: hotels.map((h) => String(h.pendingPosOrders)),
        },
      ]
    : [];
  return (
    <div className="xp-widget-status">
      <div className="xp-widget-status-title">Anlık Durum</div>
      {kpis ? (
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
            {rows.map((row) => (
              <tr key={row.label}>
                <th scope="row">{row.label}</th>
                {split ? row.cells.map((cell, i) => <td key={hotels[i]!.hotelId}>{cell}</td>) : null}
                <td className="is-total">{row.total}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p>{error ?? "Yükleniyor…"}</p>
      )}
    </div>
  );
}

const CONTENT: Record<WidgetId, () => ReactNode> = {
  clock: () => <AnalogClock />,
  calendar: () => <LeafCalendar />,
  month: () => <MonthCalendar />,
  digital: () => <DigitalClock />,
  note: () => <NoteWidget />,
  status: () => <StatusWidget />,
};

// --- frame ----------------------------------------------------------------------------------------

type WidgetProps = {
  widget: WidgetPos;
  locked: boolean;
  onMenu(e: ReactMouseEvent): void;
};

/**
 * One widget on the desktop. Dragged like a shortcut icon (pointer capture; only the element's style
 * changes until release), unless the desktop is locked or the press starts on a control inside it.
 */
export function DesktopWidget({ widget, locked, onMenu }: WidgetProps) {
  const def = WIDGETS[widget.id];
  const drag = useRef<{ id: number; px: number; py: number; moved: boolean; x: number; y: number } | null>(null);

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (locked || e.button !== 0 || (e.target as Element).closest("textarea, button, input, a")) return;
    drag.current = { id: e.pointerId, px: e.clientX, py: e.clientY, moved: false, x: widget.x, y: widget.y };
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.px;
    const dy = e.clientY - d.py;
    if (!d.moved) {
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      d.moved = true;
      e.currentTarget.setPointerCapture(e.pointerId);
      e.currentTarget.classList.add("is-dragging");
    }
    const vp = effectiveViewport(windowStore.getState());
    const pos = widgetPosition(widget.id, widget.x + dx, widget.y + dy, vp, deskHeight(vp));
    d.x = pos.x;
    d.y = pos.y;
    e.currentTarget.style.left = `${pos.x}px`;
    e.currentTarget.style.top = `${pos.y}px`;
  };

  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    drag.current = null;
    if (!d?.moved) return;
    e.currentTarget.classList.remove("is-dragging");
    windowStore.getState().moveWidget(widget.id, d.x, d.y);
  };

  return (
    <div
      className="xp-widget"
      data-widget={widget.id}
      data-locked={locked}
      role="group"
      aria-label={def.title}
      // A browser window made narrower than the saved place keeps the widget on screen.
      style={{
        left: `max(0px, min(${widget.x}px, calc(100% - ${def.w}px)))`,
        top: `max(0px, min(${widget.y}px, calc(100% - ${def.h}px)))`,
        width: def.w,
        height: def.h,
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onContextMenu={(e) => {
        // The note keeps the browser's own menu (paste, spelling).
        if ((e.target as Element).closest("textarea")) {
          e.stopPropagation();
          return;
        }
        e.preventDefault();
        e.stopPropagation();
        onMenu(e);
      }}
    >
      {CONTENT[widget.id]()}
    </div>
  );
}

// --- gallery --------------------------------------------------------------------------------------

type GalleryProps = {
  /** Widgets this user may add (permission-bound ones already filtered). */
  available: WidgetDef[];
  onClose(): void;
};

/** "Widget ekle…": every widget with what it does, and a button to put it on or take it off the desktop. */
export function WidgetGallery({ available, onClose }: GalleryProps) {
  const widgets = useWindowStore((s) => s.widgets);
  const titleId = useId();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const root = typeof document === "undefined" ? null : (document.getElementById("xp-dialog-root") ?? document.body);
  if (!root) return null;
  return createPortal(
    <div className="xp-modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-labelledby={titleId} className="xp-window xp-dialog xp-widget-gallery">
        <div className="xp-titlebar">
          <span id={titleId} className="xp-titlebar-text">
            Masaüstü Widget&apos;ları
          </span>
          <button type="button" aria-label="Kapat" className="xp-title-button is-close" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="xp-widget-gallery-body">
          <p className="xp-widget-gallery-note">
            Eklediğiniz widget&apos;lar ve yerleri hesabınıza kaydedilir; hangi bilgisayardan girerseniz girin masaüstünüz aynı açılır.
          </p>
          <ul>
            {available.map((def) => {
              const on = widgets.some((w) => w.id === def.id);
              return (
                <li key={def.id} data-on={on}>
                  <div>
                    <strong>{def.title}</strong>
                    <span>{def.description}</span>
                  </div>
                  <span className="xp-badge" data-on={on}>
                    {on ? "masaüstünde" : "ekli değil"}
                  </span>
                  <button
                    type="button"
                    className="xp-button"
                    onClick={() => (on ? windowStore.getState().removeWidget(def.id) : windowStore.getState().addWidget(def.id))}
                  >
                    {on ? "Kaldır" : "Ekle"}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
        <div className="xp-dialog-actions">
          <button type="button" className="xp-button" autoFocus onClick={onClose}>
            Kapat
          </button>
        </div>
      </div>
    </div>,
    root,
  );
}
