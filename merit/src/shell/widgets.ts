import type { WidgetId, WidgetPos } from "./types";

/*
 * Desktop widgets of the XP shell. Which ones a user has, and where, is part of their shell prefs
 * (`User.prefs.shell.widgets`), saved like the shortcut icons. Sizes are fixed: a position is clamped
 * with them so a widget never ends up outside the desktop.
 */

export type WidgetDef = {
  id: WidgetId;
  title: string;
  description: string;
  w: number;
  h: number;
  /** Shown only to users who may see this screen (the widget reads that screen's data). */
  screenCode?: string;
};

export const WIDGETS: Record<WidgetId, WidgetDef> = {
  clock: { id: "clock", title: "Analog Saat", description: "Akrep ve yelkovanlı duvar saati.", w: 168, h: 186 },
  calendar: { id: "calendar", title: "Yaprak Takvim", description: "Günün tarihi, koparmalı takvim yaprağı gibi.", w: 168, h: 196 },
  month: { id: "month", title: "Aylık Takvim", description: "İçinde bulunulan ayın günleri; bugün işaretli.", w: 216, h: 214 },
  digital: { id: "digital", title: "Dijital Saat", description: "Saat, saniye ve tarih tek satırda.", w: 216, h: 84 },
  note: { id: "note", title: "Not Kağıdı", description: "Kendinize kısa notlar; yalnızca siz görürsünüz.", w: 216, h: 190 },
  status: {
    id: "status",
    title: "Anlık Durum",
    description: "Çevrimiçi kullanıcı, doluluk ve bekleyen işler (Komuta Merkezi rakamları).",
    w: 216,
    h: 172,
    screenCode: "CR-KOM",
  },
};

export const WIDGET_IDS = Object.keys(WIDGETS) as WidgetId[];

const MARGIN = 16;
const GAP = 12;

type Viewport = { w: number; h: number };

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), Math.max(lo, hi));

/** `x`,`y` kept inside a desktop of `vp.w` × `deskH`. */
export function widgetPosition(id: WidgetId, x: number, y: number, vp: Viewport, deskH: number): { x: number; y: number } {
  const def = WIDGETS[id];
  return { x: clamp(Math.round(x), 0, vp.w - def.w), y: clamp(Math.round(y), 0, deskH - def.h) };
}

/** Width of one widget column (the widest widget plus the gap to the next column). */
const COLUMN = 232;

/**
 * Where a newly added widget goes: the first free place, searching down the right edge and then
 * column by column to the left, so it never lands on top of another widget.
 */
export function nextWidgetPosition(id: WidgetId, existing: readonly WidgetPos[], vp: Viewport, deskH: number): { x: number; y: number } {
  const def = WIDGETS[id];
  for (let x = vp.w - MARGIN - def.w; x >= 0; x -= COLUMN) {
    let y = MARGIN;
    while (y + def.h <= deskH) {
      const blocker = existing.find((w) => {
        const o = WIDGETS[w.id];
        return w.x < x + def.w + GAP && x < w.x + o.w + GAP && w.y < y + def.h + GAP && y < w.y + o.h + GAP;
      });
      if (!blocker) return { x, y };
      y = blocker.y + WIDGETS[blocker.id].h + GAP;
    }
  }
  // A desktop with no room left: the top right corner.
  return widgetPosition(id, vp.w - MARGIN - def.w, MARGIN, vp, deskH);
}

/** A user who never touched widgets gets the clock with the calendar leaf under it, on the right. */
export function defaultWidgets(vp: Viewport, deskH: number): WidgetPos[] {
  const out: WidgetPos[] = [];
  for (const id of ["clock", "calendar"] as const) out.push({ id, ...nextWidgetPosition(id, out, vp, deskH) });
  return out;
}
