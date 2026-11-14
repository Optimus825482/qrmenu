"use client";

import { type CSSProperties, useEffect, useId, useState } from "react";
import { PriceDisplay } from "@/generated/prisma/enums";
import {
  loadRoomServiceLimitsAction,
  roomServiceLimitHotelsAction,
  setRoomServiceLimitAction,
} from "@/modules/order/server/actions/roomServiceLimits";
import {
  loadRoomServiceSettingsAction,
  saveRoomServiceSettingsAction,
} from "@/modules/order/server/actions/roomServiceSettings";
import type { RoomServiceLimitKey, RoomServiceLimits } from "@/modules/order/server/roomService/limitsAdmin";
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

type LimitField = {
  key: RoomServiceLimitKey;
  prop: "maxOpenPerRoom" | "minMinutesBetweenOrders";
  label: string;
  unit: string;
  min: number;
  max: number;
  help: string;
};

// Ranges mirror SETTING_SCHEMAS (lib/settings-defs); the server validates again.
const LIMIT_FIELDS: readonly LimitField[] = [
  {
    key: "rs.maxOpenPerRoom",
    prop: "maxOpenPerRoom",
    label: "Oda başına açık sipariş sınırı",
    unit: "adet",
    min: 1,
    max: 10,
    help: "Bir odanın aynı anda en çok kaç açık oda servisi siparişi olabileceğini belirler. Sınıra ulaşan oda, açık siparişlerinden biri teslim edilince yeni sipariş gönderebilir. 1 ile 10 arasında bir sayı yazın.",
  },
  {
    key: "rs.minMinutesBetweenOrders",
    prop: "minMinutesBetweenOrders",
    label: "İki sipariş arasındaki bekleme süresi",
    unit: "dk",
    min: 0,
    max: 1440,
    help: "Bir oda sipariş gönderdikten sonra yeni siparişini bu süre dolunca gönderebilir. Personelin iptal ettiği ya da reddettiği sipariş süreyi başlatmaz. 0 yazarsanız bekleme uygulanmaz.",
  },
];

type LimitDraft = Record<LimitField["prop"], string>;

const toLimitDraft = (limits: RoomServiceLimits): LimitDraft => ({
  maxOpenPerRoom: String(limits.maxOpenPerRoom),
  minMinutesBetweenOrders: String(limits.minMinutesBetweenOrders),
});

/** The typed text as a whole number inside the field's range, or `null`. */
function parseLimit(field: LimitField, text: string): number | null {
  if (!/^\d{1,4}$/.test(text.trim())) return null;
  const n = Number(text.trim());
  return n >= field.min && n <= field.max ? n : null;
}

// Tablet-sized touch targets (the window is used on the floor team's tablets too).
const TOUCH: CSSProperties = { minHeight: 44, fontSize: 16 };
const ROW: CSSProperties = { margin: "0 0 14px" };
const LABEL: CSSProperties = { fontWeight: 600 };
const SWITCH_LINE: CSSProperties = { display: "flex", alignItems: "center", gap: 10, minHeight: 44 };
const SWITCH: CSSProperties = { width: 22, height: 22, flex: "none" };
const HINT: CSSProperties = { margin: "4px 0 0" };

/**
 * "Oda Servisi Ayarları": one window, one Kaydet, two parts, per hotel.
 *   - the operational switches of the room-service outlet (order intake, prices, currency, receipt printing);
 *     the server finds the outlet and authorizes every call (roomService/settingsAdmin);
 *   - the per-room order limits (the former "Oda Servisi Sınırları" window), shown only to the roles that may
 *     edit them (roomService/limitsAdmin). The limits are asked for only after the allowed-hotel list says yes,
 *     so a role without them (R-FBM) never produces a refused call and its audit row.
 */
export function RoomServiceSettingsWindow({ hotelId: windowHotelId, setStatus, setDirty }: AppProps) {
  const id = useId();
  // The hotel comes from the window header (one hotel selector for every window).
  const hotelId = windowHotelId ?? "";
  const [settings, setSettings] = useState<RoomServiceSettings | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  /** Hotel whose load answered "no room-service outlet": a plain message, not an error. */
  const [missingFor, setMissingFor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [limits, setLimits] = useState<RoomServiceLimits | null>(null);
  const [limitDraft, setLimitDraft] = useState<LimitDraft | null>(null);
  const [limitsError, setLimitsError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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

  useEffect(() => {
    if (!hotelId) return;
    let live = true;
    const clear = (message: string | null) => {
      setLimits(null);
      setLimitDraft(null);
      setLimitsError(message);
    };
    (async () => {
      const hotels = await roomServiceLimitHotelsAction();
      if (!live) return;
      // Not an editor of the limits (or not for this hotel): the part is simply not shown.
      if (!hotels.ok || !hotels.data.some((h) => h.id === hotelId)) return clear(null);
      const r = await loadRoomServiceLimitsAction({ hotelId });
      if (!live) return;
      if (!r.ok) return clear(r.error.message);
      setLimits(r.data);
      setLimitDraft(toLimitDraft(r.data));
      setLimitsError(null);
    })().catch(() => {
      if (live) clear("Oda servisi sınırları yüklenemedi");
    });
    return () => {
      live = false;
    };
  }, [hotelId]);

  const loaded = settings !== null && draft !== null && settings.hotelId === hotelId;
  const missing = missingFor !== null && missingFor === hotelId;
  const settingsDirty = loaded && DRAFT_KEYS.some((k) => draft[k] !== settings[k]);

  const limitsLoaded = limits !== null && limitDraft !== null && limits.hotelId === hotelId;
  const changedLimits = limitsLoaded
    ? LIMIT_FIELDS.filter((f) => limitDraft[f.prop].trim() !== String(limits[f.prop]))
    : [];
  const limitsInvalid = limitsLoaded && LIMIT_FIELDS.some((f) => parseLimit(f, limitDraft[f.prop]) === null);

  const dirty = settingsDirty || changedLimits.length > 0;

  useEffect(() => {
    setDirty(dirty);
  }, [dirty, setDirty]);

  const currencies =
    loaded && !CURRENCIES.includes(settings.currency) ? [settings.currency, ...CURRENCIES] : CURRENCIES;

  /** Saves the switches; `false` when the server refused. */
  const saveSettings = async (): Promise<boolean> => {
    if (!loaded || !settingsDirty) return true;
    const r = await saveRoomServiceSettingsAction({ hotelId, settings: draft });
    if (!r.ok) {
      const message = Object.values(r.error.fieldErrors ?? {})[0]?.[0] ?? r.error.message;
      setError(message);
      notify.error(`Oda servisi ayarları kaydedilemedi: ${message}`);
      return false;
    }
    setSettings(r.data);
    setDraft(toDraft(r.data));
    return true;
  };

  /** Saves the changed limits one by one; `false` when the server refused one. */
  const saveLimits = async (): Promise<boolean> => {
    if (!limitsLoaded) return true;
    let latest = limits;
    for (const field of changedLimits) {
      const r = await setRoomServiceLimitAction({
        hotelId,
        key: field.key,
        value: parseLimit(field, limitDraft[field.prop]),
      });
      if (!r.ok) {
        const message = r.error.fieldErrors?.value?.[0] ?? r.error.message;
        setLimitsError(`${field.label}: ${message}`);
        notify.error(`Oda servisi sınırı kaydedilemedi: ${message}`);
        // Whatever was saved before the failure is shown as saved.
        setLimits(latest);
        return false;
      }
      latest = r.data;
    }
    setLimits(latest);
    setLimitDraft(toLimitDraft(latest));
    return true;
  };

  const save = async () => {
    if (!dirty || limitsInvalid) return;
    setBusy(true);
    setError(null);
    setLimitsError(null);
    try {
      // Both parts are tried: a refused switch must not hold back a valid limit, and the other way round.
      const settingsOk = await saveSettings();
      const limitsOk = await saveLimits();
      if (settingsOk && limitsOk) {
        notify.success("Oda servisi ayarları kaydedildi.");
        setStatus(`Oda servisi ayarları kaydedildi`);
      }
    } catch {
      setError("Oda servisi ayarları kaydedilemedi");
      notify.error("Oda servisi ayarları kaydedilemedi");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className="xp-cp-main"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <section className="xp-cp-section" aria-labelledby={`${id}-title`}>
        <h3 id={`${id}-title`} className="xp-cp-heading">
          Sipariş alımı, fiyat ve fiş
        </h3>
        <p className="xp-cp-note">
          Oda servisinin sipariş alımını, misafire gösterilen fiyatları ve fiş yazdırmayı buradan yönetirsiniz.
          Ayarlar otele özeldir; kaydedilen değer hemen geçerli olur ve her değişiklik denetim kaydına yazılır.
        </p>
        {error ? (
          <p role="alert" className="xp-defs-error" style={{ padding: "4px 0" }}>
            {error}
          </p>
        ) : null}
        {hotelId && !loaded && !missing && !error ? <p className="xp-cp-note">Yükleniyor…</p> : null}
        {!hotelId ? <p className="xp-cp-note">Pencere başlığından bir otel seçin.</p> : null}
        {missing ? (
          <p className="xp-cp-note">
            Bu otelde oda servisi tanımlı değil. Oda servisi kurulduğunda ayarları burada görünür.
          </p>
        ) : null}
        {loaded ? (
          <>
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

            <div style={{ margin: 0 }}>
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
          </>
        ) : null}
      </section>

      {limitsLoaded || limitsError ? (
        <section className="xp-cp-section" aria-labelledby={`${id}-limits-title`}>
          <h3 id={`${id}-limits-title`} className="xp-cp-heading">
            Sipariş sınırları
          </h3>
          <p className="xp-cp-note">
            Misafirin odadaki QR kodu okutarak gönderdiği oda servisi siparişlerine uygulanır. Değerler otele
            özeldir.
          </p>
          {limitsError ? (
            <p role="alert" className="xp-defs-error" style={{ padding: "4px 0" }}>
              {limitsError}
            </p>
          ) : null}
          {limitsLoaded
            ? LIMIT_FIELDS.map((field, i) => {
                const bad = parseLimit(field, limitDraft[field.prop]) === null;
                return (
                  <div key={field.key} style={i === LIMIT_FIELDS.length - 1 ? { margin: 0 } : ROW}>
                    <label htmlFor={`${id}-${field.prop}`} style={{ ...LABEL, display: "block", marginBottom: 4 }}>
                      {field.label}
                    </label>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <input
                        id={`${id}-${field.prop}`}
                        type="number"
                        inputMode="numeric"
                        className="xp-system-input xp-system-input-sm"
                        style={TOUCH}
                        min={field.min}
                        max={field.max}
                        step={1}
                        value={limitDraft[field.prop]}
                        disabled={busy}
                        aria-invalid={bad}
                        aria-describedby={`${id}-${field.prop}-help`}
                        onChange={(e) => setLimitDraft({ ...limitDraft, [field.prop]: e.target.value })}
                      />
                      <span>{field.unit}</span>
                    </div>
                    <p id={`${id}-${field.prop}-help`} className="xp-cp-note" style={HINT}>
                      {field.help}
                    </p>
                    {bad ? (
                      <p role="alert" className="xp-defs-error" style={{ padding: "2px 0 0" }}>
                        {field.min} ile {field.max} arasında bir tam sayı yazın.
                      </p>
                    ) : null}
                  </div>
                );
              })
            : null}
        </section>
      ) : null}

      {loaded || limitsLoaded ? (
        <button
          type="submit"
          className="xp-button"
          style={{ ...TOUCH, minWidth: 120 }}
          disabled={busy || !dirty || limitsInvalid}
        >
          {busy ? "Kaydediliyor…" : "Kaydet"}
        </button>
      ) : null}
    </form>
  );
}
