"use client";

import { type CSSProperties, useEffect, useId, useState } from "react";
import { PriceDisplay } from "@/generated/prisma/enums";
import {
  loadRoomServiceSettingsAction,
  roomServiceSettingsHotelsAction,
  saveRoomServiceSettingsAction,
} from "@/modules/order/server/actions/roomServiceSettings";
import type { RoomServiceSettings } from "@/modules/order/server/roomService/settingsAdmin";
import { notify } from "@/shell/notify";
import type { AppProps } from "@/shell/registry";

type Draft = Pick<RoomServiceSettings, "orderingEnabled" | "autoPrintReceipt" | "priceDisplay" | "currency">;

const toDraft = (s: RoomServiceSettings): Draft => ({
  orderingEnabled: s.orderingEnabled,
  autoPrintReceipt: s.autoPrintReceipt,
  priceDisplay: s.priceDisplay,
  currency: s.currency,
});

const DRAFT_KEYS = ["orderingEnabled", "autoPrintReceipt", "priceDisplay", "currency"] as const;

/** Currencies offered (ISO 4217), as in the outlet form; a stored code outside the list stays selectable. */
const CURRENCIES: readonly string[] = ["EUR", "TRY", "USD", "GBP", "RUB"];

const PRICE_LABELS: Record<PriceDisplay, string> = {
  INHERIT: "Otelin genel fiyat ayarını kullan",
  SHOW: "Göster",
  HIDE: "Gizle",
};

// Tablet-sized touch targets (the window is used on the floor team's tablets too).
const TOUCH: CSSProperties = { minHeight: 44, fontSize: 16 };
const ROW: CSSProperties = { margin: "0 0 14px" };
const LABEL: CSSProperties = { fontWeight: 600 };
const SWITCH_LINE: CSSProperties = { display: "flex", alignItems: "center", gap: 10, minHeight: 44 };
const SWITCH: CSSProperties = { width: 22, height: 22, flex: "none" };
const HINT: CSSProperties = { margin: "4px 0 0" };

/**
 * "Oda Servisi Ayarları": the operational switches of the hotel's room-service outlet (order intake, prices,
 * currency, receipt printing), per hotel. For the Oda Servisi Sorumlusu and the system administrator; the server
 * finds the outlet and authorizes every call (roomService/settingsAdmin).
 */
export function RoomServiceSettingsWindow({ setStatus, setDirty }: AppProps) {
  const id = useId();
  const [hotels, setHotels] = useState<{ id: string; name: string }[] | null>(null);
  const [hotelId, setHotelId] = useState("");
  const [settings, setSettings] = useState<RoomServiceSettings | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  /** Hotel whose load answered "no room-service outlet": a plain message, not an error. */
  const [missingFor, setMissingFor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    roomServiceSettingsHotelsAction()
      .then((r) => {
        if (!live) return;
        if (r.ok) {
          setHotels(r.data);
          setHotelId(r.data[0]?.id ?? "");
        } else {
          setHotels([]);
          setError(r.error.message);
        }
      })
      .catch(() => {
        if (!live) return;
        setHotels([]);
        setError("Oteller yüklenemedi");
      });
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (!hotelId) return;
    let live = true;
    loadRoomServiceSettingsAction({ hotelId })
      .then((r) => {
        if (!live) return;
        if (r.ok) {
          setSettings(r.data);
          setDraft(toDraft(r.data));
          setMissingFor(null);
          setError(null);
        } else {
          setSettings(null);
          setDraft(null);
          if (r.error.code === "NOT_FOUND") {
            setMissingFor(hotelId);
            setError(null);
          } else {
            setMissingFor(null);
            setError(r.error.message);
          }
        }
      })
      .catch(() => {
        if (live) setError("Oda servisi ayarları yüklenemedi");
      });
    return () => {
      live = false;
    };
  }, [hotelId]);

  const loaded = settings !== null && draft !== null && settings.hotelId === hotelId;
  const missing = missingFor !== null && missingFor === hotelId;
  const dirty = loaded && DRAFT_KEYS.some((k) => draft[k] !== settings[k]);

  useEffect(() => {
    setDirty(dirty);
  }, [dirty, setDirty]);

  const hotelName = hotels?.find((h) => h.id === hotelId)?.name ?? "";
  const currencies =
    loaded && !CURRENCIES.includes(settings.currency) ? [settings.currency, ...CURRENCIES] : CURRENCIES;

  const save = async () => {
    if (!loaded || !dirty) return;
    setBusy(true);
    setError(null);
    try {
      const r = await saveRoomServiceSettingsAction({ hotelId, settings: draft });
      if (!r.ok) {
        const message = Object.values(r.error.fieldErrors ?? {})[0]?.[0] ?? r.error.message;
        setError(message);
        notify.error(`Oda servisi ayarları kaydedilemedi: ${message}`);
        return;
      }
      setSettings(r.data);
      setDraft(toDraft(r.data));
      notify.success("Oda servisi ayarları kaydedildi.");
      setStatus(`${hotelName}: oda servisi ayarları kaydedildi`);
    } catch {
      setError("Oda servisi ayarları kaydedilemedi");
      notify.error("Oda servisi ayarları kaydedilemedi");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="xp-cp-main">
      <section className="xp-cp-section" aria-labelledby={`${id}-title`}>
        <h3 id={`${id}-title`} className="xp-cp-heading">
          Oda servisi ayarları
        </h3>
        <p className="xp-cp-note">
          Oda servisinin sipariş alımını, misafire gösterilen fiyatları ve fiş yazdırmayı buradan yönetirsiniz.
          Ayarlar otele özeldir; kaydedilen değer hemen geçerli olur ve her değişiklik denetim kaydına yazılır.
        </p>
        {hotels && hotels.length > 1 ? (
          <div className="xp-cp-color" style={{ marginBottom: 10 }}>
            <label htmlFor={`${id}-hotel`}>Otel</label>
            <select
              id={`${id}-hotel`}
              className="xp-system-select"
              style={TOUCH}
              value={hotelId}
              disabled={busy}
              onChange={(e) => setHotelId(e.target.value)}
            >
              {hotels.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        {error ? (
          <p role="alert" className="xp-defs-error" style={{ padding: "4px 0" }}>
            {error}
          </p>
        ) : null}
        {hotels === null || (hotelId && !loaded && !missing && !error) ? <p className="xp-cp-note">Yükleniyor…</p> : null}
        {hotels && hotels.length === 0 && !error ? (
          <p className="xp-cp-note">Oda servisi ayarlarını değiştirebileceğiniz bir otel yok.</p>
        ) : null}
        {missing ? (
          <p className="xp-cp-note">
            Bu otelde oda servisi tanımlı değil. Oda servisi kurulduğunda ayarları burada görünür.
          </p>
        ) : null}
        {loaded ? (
          <form
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <div style={ROW}>
              <div style={SWITCH_LINE}>
                <input
                  id={`${id}-ordering`}
                  type="checkbox"
                  role="switch"
                  style={SWITCH}
                  checked={draft.orderingEnabled}
                  disabled={busy}
                  aria-describedby={`${id}-ordering-help`}
                  onChange={(e) => setDraft({ ...draft, orderingEnabled: e.target.checked })}
                />
                <label htmlFor={`${id}-ordering`} style={LABEL}>
                  Sipariş alımı {draft.orderingEnabled ? "açık" : "kapalı"}
                </label>
              </div>
              <p id={`${id}-ordering-help`} className="xp-cp-note" style={HINT}>
                Kapattığınızda misafir oda servisi menüsünü görmeye devam eder ama yeni sipariş gönderemez. Açık
                siparişler etkilenmez.
              </p>
              {!settings.canTakeOrders ? (
                <p className="xp-cp-note" style={HINT}>
                  Bu otelde oda servisi şu anda pasif ya da sipariş modülü kapalı; bu anahtar açık olsa da misafir
                  sipariş gönderemez. Sistem yöneticinize başvurun.
                </p>
              ) : null}
            </div>

            <div style={ROW}>
              <label htmlFor={`${id}-price`} style={{ ...LABEL, display: "block", marginBottom: 4 }}>
                Fiyat gösterimi
              </label>
              <select
                id={`${id}-price`}
                className="xp-system-select"
                style={TOUCH}
                value={draft.priceDisplay}
                disabled={busy}
                aria-describedby={`${id}-price-help`}
                onChange={(e) => setDraft({ ...draft, priceDisplay: e.target.value as PriceDisplay })}
              >
                {Object.values(PriceDisplay).map((value) => (
                  <option key={value} value={value}>
                    {PRICE_LABELS[value]}
                  </option>
                ))}
              </select>
              <p id={`${id}-price-help`} className="xp-cp-note" style={HINT}>
                Misafirin oda servisi menüsünde ve sipariş özetinde fiyatların görünüp görünmeyeceğini belirler.
              </p>
            </div>

            <div style={ROW}>
              <label htmlFor={`${id}-currency`} style={{ ...LABEL, display: "block", marginBottom: 4 }}>
                Para birimi
              </label>
              <select
                id={`${id}-currency`}
                className="xp-system-select"
                style={TOUCH}
                value={draft.currency}
                disabled={busy}
                aria-describedby={`${id}-currency-help`}
                onChange={(e) => setDraft({ ...draft, currency: e.target.value })}
              >
                {currencies.map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </select>
              <p id={`${id}-currency-help`} className="xp-cp-note" style={HINT}>
                Oda servisi fiyatlarının yazıldığı para birimi. Değişiklik yeni siparişlere uygulanır; menüdeki
                tutarlar çevrilmez.
              </p>
            </div>

            <div style={ROW}>
              <div style={SWITCH_LINE}>
                <input
                  id={`${id}-receipt`}
                  type="checkbox"
                  role="switch"
                  style={SWITCH}
                  checked={draft.autoPrintReceipt}
                  disabled={busy}
                  aria-describedby={`${id}-receipt-help`}
                  onChange={(e) => setDraft({ ...draft, autoPrintReceipt: e.target.checked })}
                />
                <label htmlFor={`${id}-receipt`} style={LABEL}>
                  Onaylanan siparişin fişini otomatik yazdır
                </label>
              </div>
              <p id={`${id}-receipt-help`} className="xp-cp-note" style={HINT}>
                Sipariş onaylandığında fişi tanımlı yazıcıya gönderilir. Tanımlı yazıcı yoksa fiş yazdırılmaz.
              </p>
            </div>

            <button
              type="submit"
              className="xp-button"
              style={{ ...TOUCH, minWidth: 120 }}
              disabled={busy || !dirty}
            >
              {busy ? "Kaydediliyor…" : "Kaydet"}
            </button>
          </form>
        ) : null}
      </section>
    </div>
  );
}
