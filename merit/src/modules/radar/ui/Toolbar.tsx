"use client";

import { Icon, type IconName } from "@/components/icons/Icon";
import { LAYER_LABELS } from "../labels";
import type { RadarLayer, WallView } from "../types";

export type ViewKey = WallView;

export const VIEW_LABELS: Record<ViewKey, string> = {
  genel: "Genel Bakış",
  kat: "Kat",
  masa: "Masa",
  kuyruk: "Kuyruklar",
  odaServisi: "Oda Servisi",
  personel: "Personel",
};

export const LAYER_ICONS: Record<RadarLayer, IconName> = {
  MINIBAR: "minibar",
  SIPARIS: "utensils",
  ODA_SERVISI: "concierge",
  PERSONEL: "users",
  SISTEM: "shield",
};

export type ConnectionState = "live" | "connecting" | "offline";

export const CONNECTION_TEXT: Record<ConnectionState, string> = {
  live: "Canlı",
  connecting: "Bağlanıyor",
  offline: "Çevrimdışı",
};

export type ToolbarProps = {
  idPrefix: string;
  hotels: { id: string; code: string; name: string }[];
  hotelId: string;
  onHotel(id: string): void;
  /** Layers inside the caller's scope; only these get a button. */
  layers: RadarLayer[];
  active: ReadonlySet<RadarLayer>;
  onToggleLayer(layer: RadarLayer): void;
  views: ViewKey[];
  view: ViewKey;
  onView(view: ViewKey): void;
  connection: ConnectionState;
  /** Extra mode text of the connection area ("Geçmiş 14:12:30"). */
  modeText?: string;
  /** The "Animasyon" switch of the scene layer; `reduced` locks it off (system reduced-motion setting). */
  motion?: { on: boolean; reduced: boolean; onToggle(): void };
  /** Client-side demo scenario: the start button, and the badge while it runs. `disabled` carries its reason in `hint`. */
  demo?: { running: boolean; disabled: boolean; hint?: string; onStart(): void; onStop(): void };
};

export function Toolbar(p: ToolbarProps) {
  const multi = p.hotels.length > 1;
  return (
    <div className="rd-toolbar" role="toolbar" aria-label="Radar araç çubuğu">
      {multi ? (
        <select
          className="rd-select"
          aria-label="Otel"
          value={p.hotelId}
          onChange={(e) => p.onHotel(e.target.value)}
        >
          <option value="ALL">Tüm kompleks</option>
          {p.hotels.map((h) => (
            <option key={h.id} value={h.id}>
              {h.name}
            </option>
          ))}
        </select>
      ) : (
        <span className="rd-hotel-name">{p.hotels[0]?.name ?? "—"}</span>
      )}
      <span className="rd-toolbar-sep" aria-hidden="true" />
      <div role="group" aria-label="Katmanlar" className="rd-tabs">
        {p.layers.map((layer, i) => (
          <button
            key={layer}
            type="button"
            className="rd-chip"
            aria-pressed={p.active.has(layer)}
            title={`Alt+${i + 1}`}
            onClick={() => p.onToggleLayer(layer)}
          >
            <Icon name={LAYER_ICONS[layer]} size={14} />
            {LAYER_LABELS[layer]}
          </button>
        ))}
      </div>
      <span className="rd-toolbar-sep" aria-hidden="true" />
      <div role="tablist" aria-label="Görünümler" className="rd-tabs" data-guide="radar-genel">
        {p.views.map((v, i) => (
          <button
            key={v}
            type="button"
            role="tab"
            className="rd-tab"
            id={`${p.idPrefix}-tab-${v}`}
            aria-selected={p.view === v}
            aria-controls={`${p.idPrefix}-view`}
            title={`${i + 1}`}
            onClick={() => p.onView(v)}
          >
            {VIEW_LABELS[v]}
          </button>
        ))}
      </div>
      {p.motion ? (
        <button
          type="button"
          className="rd-chip"
          aria-pressed={p.motion.on}
          disabled={p.motion.reduced}
          title={
            p.motion.reduced
              ? "Sistem hareketi azalt ayarı açık: animasyon kapalı"
              : p.motion.on
                ? "Animasyon: Açık"
                : "Animasyon: Kapalı"
          }
          onClick={p.motion.onToggle}
        >
          <Icon name="sparkles" size={14} />
          Animasyon
        </button>
      ) : null}
      {p.demo ? (
        <>
          <button
            type="button"
            className="rd-chip"
            data-testid={p.demo.running ? "radar-demo-stop" : "radar-demo-start"}
            data-guide="radar-demo"
            disabled={!p.demo.running && p.demo.disabled}
            title={p.demo.running ? "Demoyu durdur ve canlıya dön" : (p.demo.hint ?? "Sentetik bir gün senaryosunu oynat")}
            onClick={p.demo.running ? p.demo.onStop : p.demo.onStart}
          >
            <Icon name={p.demo.running ? "pause" : "play"} size={14} />
            {p.demo.running ? "Demo durdur" : "Demo başlat"}
          </button>
          {p.demo.running ? (
            <span className="rd-demo-badge" data-testid="radar-demo-badge" role="status" title="Gösterilen veriler sentetiktir">
              DEMO
            </span>
          ) : null}
        </>
      ) : null}
      <span className="rd-conn" data-state={p.connection} role="status">
        <Icon name={p.connection === "offline" ? "wifi-off" : "wifi"} size={14} />
        {p.modeText ?? CONNECTION_TEXT[p.connection]}
      </span>
    </div>
  );
}
