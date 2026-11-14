"use client";

import { useMemo } from "react";
import { Icon, type IconName } from "@/components/icons/Icon";
import type { RadarState } from "../state";
import type { RadarEvent } from "../types";
import { describeEvent, isHeartbeat, lookupFromState, type NameStyle } from "./eventSentence";

export const TICKER_MAX_ITEMS = 100;

const clock = (iso: string) =>
  new Intl.DateTimeFormat("tr-TR", {
    timeZone: "Europe/Nicosia",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date(Date.parse(iso) || 0));

export type EventBadgeTone = "warn" | "success" | "purple" | "info" | "accent" | "danger" | "teal" | "muted";

export type EventBadge = {
  label: string;
  tone: EventBadgeTone;
  icon: IconName;
};

export function getEventBadge(ev: RadarEvent): EventBadge {
  switch (ev.type) {
    case "call.opened":
      return {
        label: ev.callType === "HESAP" ? "Hesap İsteği" : ev.callType === "GARSON" ? "Garson Çağrısı" : "Çağrı",
        tone: "warn",
        icon: "bell",
      };
    case "call.closed":
      return {
        label: "Çağrı Kapandı",
        tone: "success",
        icon: "check",
      };
    case "table.scanned":
      return {
        label: "QR Okutuldu",
        tone: "purple",
        icon: "qr",
      };
    case "order.status":
      if (ev.to === "IPTAL" || ev.to === "REDDEDILDI") {
        return { label: ev.to === "IPTAL" ? "Sipariş İptal" : "Sipariş Red", tone: "danger", icon: "close" };
      }
      if (ev.to === "TESLIM_EDILDI" || ev.to === "SERVIS_EDILDI" || ev.to === "HAZIR") {
        return { label: ev.to === "HAZIR" ? "Sipariş Hazır" : "Teslim Edildi", tone: "success", icon: "check-circle" };
      }
      if (ev.to === "ONAYLANDI" || ev.prep) {
        return { label: "Hazırlanıyor", tone: "accent", icon: "utensils" };
      }
      return { label: "Yeni Sipariş", tone: "info", icon: "utensils" };
    case "order.escalated":
      return { label: "Onay Aşıldı", tone: "danger", icon: "warning" };
    case "order.sla":
      return { label: ev.level === "BREACH" ? "SLA Aşıldı" : "SLA Uyarısı", tone: "danger", icon: "warning" };
    case "table.assigned":
      return { label: ev.waiterId ? "Garson Atandı" : "Atama Kaldırıldı", tone: "teal", icon: "user" };
    case "print.job":
      return {
        label: ev.status === "HATA" ? "Baskı Hatası" : ev.status === "BASILDI" ? "Baskı Tamam" : "Baskı",
        tone: ev.status === "HATA" ? "danger" : "muted",
        icon: "printer",
      };
    case "printer.health":
      return {
        label: ev.state === "HATA" ? "Yazıcı Hatası" : ev.state === "SESSIZ" ? "Yazıcı Sessiz" : "Yazıcı Hazır",
        tone: ev.state === "HATA" ? "danger" : ev.state === "SESSIZ" ? "warn" : "muted",
        icon: "printer",
      };
    case "room.checked":
      return { label: "Oda Kontrolü", tone: "accent", icon: "door" };
    case "room.check.changed":
      return { label: "Kontrol Değişti", tone: "muted", icon: "edit" };
    case "room.scanned":
      return { label: "Oda QR", tone: "purple", icon: "qr" };
    case "dnd.marked":
    case "dnd.missed":
      return { label: "DND", tone: "warn", icon: "moon" };
    case "mybar.opened":
    case "mybar.seen":
    case "mybar.closed":
      return { label: "MyBar", tone: "info", icon: "minibar" };
    case "task.updated":
    case "task.generated":
      return { label: "Görev", tone: "muted", icon: "clipboard" };
    case "stock.level":
      return { label: "Stok", tone: "warn", icon: "box" };
    case "upload.status":
      return { label: "Doluluk", tone: "muted", icon: "clipboard" };
    case "presence":
      if (isHeartbeat(ev)) return { label: "Personel", tone: "muted", icon: "users" };
      if (ev.status === "CIKTI" || ev.status === "DUSURULDU") {
        return { label: ev.status === "CIKTI" ? "Oturum Kapandı" : "Oturum Sonlandı", tone: "muted", icon: "users" };
      }
      if (ev.status === "UYARI") return { label: "Oturum Süresi", tone: "warn", icon: "users" };
      if (ev.status === "BOSTA") return { label: "Personel Boşta", tone: "info", icon: "users" };
      return { label: "Personel Çevrimiçi", tone: "success", icon: "users" };
    default:
      return { label: "Sistem", tone: "muted", icon: "shield" };
  }
}

export type TickerProps = {
  events: readonly RadarEvent[];
  state?: RadarState | null;
  mode?: "window" | "wall";
  nameStyle?: NameStyle;
  onSelect?(event: RadarEvent): void;
  /** "Tüm kompleks": the short name of the hotel an event belongs to, shown on its row. */
  hotelTag?(hotelId: string): string | undefined;
};

/**
 * Live event ticker: newest on top, vertical feed on the right, badges with distinct colours and icons.
 */
export function Ticker({ events, state, mode = "window", nameStyle, onSelect, hotelTag }: TickerProps) {
  const style: NameStyle = nameStyle ?? (mode === "wall" ? "short" : "full");
  const people = state?.people ?? {};
  const lookup = useMemo(() => lookupFromState(state), [state]);
  const limit = TICKER_MAX_ITEMS;

  const items = useMemo(() => {
    const out: RadarEvent[] = [];
    for (let i = events.length - 1; i >= 0 && out.length < limit; i--) {
      // Per-minute session heartbeats only refresh "Son etkinlik"; they are not news.
      if (isHeartbeat(events[i]!)) continue;
      out.push(events[i]!);
    }
    return out;
  }, [events, limit]);

  return (
    <aside className="rd-ticker" data-mode={mode} aria-label="Olay şeridi">
      <div className="rd-ticker-head">
        <div className="rd-ticker-title-group">
          <h3>Olay akışı</h3>
          <span className="rd-ticker-live-dot" title="Canlı akış" />
        </div>
        <span className="rd-muted rd-small">{items.length} olay</span>
      </div>
      {items.length === 0 ? (
        <p className="rd-muted rd-small">Henüz olay yok.</p>
      ) : (
        <ul className="rd-ticker-list">
          {items.map((ev) => {
            const badge = getEventBadge(ev);
            const sentence = describeEvent(ev, people, style, lookup);
            const content = (
              <>
                <div className="rd-ticker-header">
                  <span className="rd-ticker-badge" data-tone={badge.tone}>
                    <Icon name={badge.icon} size={11} />
                    <span>{badge.label}</span>
                  </span>
                  {hotelTag?.(ev.hotelId) ? <span className="rd-ticker-hotel">{hotelTag(ev.hotelId)}</span> : null}
                  <span className="rd-ticker-time">{clock(ev.at)}</span>
                </div>
                <div className="rd-ticker-text">{sentence}</div>
              </>
            );
            return (
              <li key={ev.id} className="rd-ticker-row">
                {onSelect ? (
                  <button type="button" className="rd-ticker-btn" data-tone={badge.tone} onClick={() => onSelect(ev)}>
                    {content}
                  </button>
                ) : (
                  <div className="rd-ticker-btn" data-tone={badge.tone}>
                    {content}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </aside>
  );
}
