"use client";

import { Icon } from "@/components/icons/Icon";
import type { Tone } from "../labels";
import type { ViewKey } from "./Toolbar";

export const LEGEND_STORAGE_PREFIX = "merit.u.";
export const LEGEND_STORAGE_SUFFIX = ".radar.legendSeen";

/** Reads how many times the user has opened the radar; increments up to 4 and returns true for the first 3 opens. */
export function consumeInitialLegendOpen(userId = "default"): boolean {
  const key = `${LEGEND_STORAGE_PREFIX}${userId}${LEGEND_STORAGE_SUFFIX}`;
  try {
    if (typeof window === "undefined" || !window.localStorage) return true;
    const raw = window.localStorage.getItem(key);
    const seen = raw ? Number.parseInt(raw, 10) || 0 : 0;
    const next = seen + 1;
    window.localStorage.setItem(key, String(Math.min(next, 10)));
    return next <= 3;
  } catch {
    return true;
  }
}

type LegendItem = { tone: Tone; edge?: "solid" | "dashed" | "double"; badge?: string; text: string };

const VIEW_LEGEND: Record<ViewKey, LegendItem[]> = {
  genel: [
    { tone: "success", text: "Normal: eşik altında" },
    { tone: "warn", text: "Dikkat: eşiğe yakın" },
    { tone: "danger", text: "Kritik: eşik aşıldı" },
  ],
  kat: [
    { tone: "muted", edge: "solid", text: "Dolu oda (düz kenar) · Görev yok" },
    { tone: "muted", edge: "dashed", text: "Boş oda (kesik kenar)" },
    { tone: "warn", badge: "M12", text: "Görev bekliyor · MyBar dakika" },
    { tone: "info", badge: "D1/2", text: "Görev sürüyor · DND kontrol sayısı" },
    { tone: "success", badge: "check", text: "Tamamlandı / bugün kontrol edildi" },
    { tone: "danger", text: "Eksik görev veya eksik DND" },
  ],
  masa: [
    { tone: "muted", text: "Boş masa" },
    { tone: "accent", edge: "dashed", text: "Dolu masa (son 40 dk aktivite)" },
    { tone: "warn", text: "Onay bekliyor (kalın kenar)" },
    { tone: "info", text: "Hazırlanıyor" },
    { tone: "success", edge: "double", text: "Hazır (çift kenar)" },
    { tone: "danger", text: "Çağrı süresi aşıldı" },
  ],
  kuyruk: [
    { tone: "success", text: "Yazıcı hazır / kuyruk normal" },
    { tone: "warn", text: "Bekleyen adisyon veya iş var" },
    { tone: "danger", text: "Baskı hatası veya sessiz yazıcı" },
  ],
  odaServisi: [
    { tone: "info", text: "SLA normal (< %80)" },
    { tone: "warn", text: "SLA dikkat (≥ %80)" },
    { tone: "danger", text: "SLA kritik (≥ %100)" },
  ],
  mybar: [
    { tone: "info", text: "Bekleme normal" },
    { tone: "warn", text: "Bekleme dikkat (≥ %80)" },
    { tone: "danger", text: "Gecikti (bekleme sınırı aşıldı)" },
    { tone: "success", text: "Tamamlandı" },
  ],
  personel: [
    { tone: "success", text: "Etkin oturum" },
    { tone: "info", text: "Boşta (hareketsiz)" },
    { tone: "warn", text: "Oturum süresi doluyor" },
  ],
};

export type LegendProps = {
  view: ViewKey;
  open: boolean;
  compact?: boolean;
  onClose?(): void;
};

/** Per-view glyph/tone/text legend (spec 5.7). */
export function Legend({ view, open, compact = false, onClose }: LegendProps) {
  if (!open) return null;
  const items = VIEW_LEGEND[view] ?? VIEW_LEGEND.genel;
  return (
    <section
      className="rd-legend"
      data-compact={compact ? "1" : undefined}
      aria-label="Görünüm açıklaması"
    >
      <div className="rd-row">
        <h4>Açıklama</h4>
        {!compact && onClose ? (
          <button type="button" className="rd-link" onClick={onClose}>
            Gizle
          </button>
        ) : null}
      </div>
      <ul className="rd-legend-list">
        {items.map((item) => (
          <li key={item.text} className="rd-legend-item" data-tone={item.tone}>
            <span className="rd-legend-swatch" data-edge={item.edge ?? "solid"} aria-hidden="true">
              {item.badge === "check" ? <Icon name="check" size={11} /> : item.badge ?? null}
            </span>
            <span>{item.text}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
