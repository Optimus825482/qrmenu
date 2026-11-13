"use client";

import { type CSSProperties, useEffect, useId, useState } from "react";
import {
  loadRoomServiceLimitsAction,
  setRoomServiceLimitAction,
} from "@/modules/order/server/actions/roomServiceLimits";
import type { RoomServiceLimitKey, RoomServiceLimits } from "@/modules/order/server/roomService/limitsAdmin";
import { notify } from "@/shell/notify";
import type { AppProps } from "@/shell/registry";

type FieldDef = {
  key: RoomServiceLimitKey;
  prop: "maxOpenPerRoom" | "minMinutesBetweenOrders";
  label: string;
  unit: string;
  min: number;
  max: number;
  help: string;
};

// Ranges mirror SETTING_SCHEMAS (lib/settings-defs); the server validates again.
const FIELDS: readonly FieldDef[] = [
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

type Draft = Record<FieldDef["prop"], string>;

const toDraft = (limits: RoomServiceLimits): Draft => ({
  maxOpenPerRoom: String(limits.maxOpenPerRoom),
  minMinutesBetweenOrders: String(limits.minMinutesBetweenOrders),
});

/** The typed text as a whole number inside the field's range, or `null`. */
function parseField(field: FieldDef, text: string): number | null {
  if (!/^\d{1,4}$/.test(text.trim())) return null;
  const n = Number(text.trim());
  return n >= field.min && n <= field.max ? n : null;
}

// Tablet-sized touch targets (the window is used on the floor team's tablets too).
const TOUCH: CSSProperties = { minHeight: 44, fontSize: 16 };

/**
 * "Oda Servisi Sınırları": the open-order limit per room and the wait between two orders of a room, per hotel.
 * For the Oda Servisi Sorumlusu and the system administrator; the server authorizes every call (limitsAdmin).
 */
export function RoomServiceLimitsWindow({ hotelId: windowHotelId, setStatus, setDirty }: AppProps) {
  const id = useId();
  // The hotel comes from the window header (one hotel selector for every window).
  const hotelId = windowHotelId ?? "";
  const [limits, setLimits] = useState<RoomServiceLimits | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!hotelId) return;
    let live = true;
    loadRoomServiceLimitsAction({ hotelId })
      .then((r) => {
        if (!live) return;
        if (r.ok) {
          setLimits(r.data);
          setDraft(toDraft(r.data));
          setError(null);
        } else {
          setLimits(null);
          setDraft(null);
          setError(r.error.message);
        }
      })
      .catch(() => {
        if (live) setError("Oda servisi sınırları yüklenemedi");
      });
    return () => {
      live = false;
    };
  }, [hotelId]);

  const loaded = limits !== null && draft !== null && limits.hotelId === hotelId;
  const changed = loaded ? FIELDS.filter((f) => draft[f.prop].trim() !== String(limits[f.prop])) : [];
  const invalid = loaded ? FIELDS.filter((f) => parseField(f, draft[f.prop]) === null) : [];
  const dirty = changed.length > 0;

  useEffect(() => {
    setDirty(dirty);
  }, [dirty, setDirty]);


  const save = async () => {
    if (!loaded || !dirty || invalid.length > 0) return;
    setBusy(true);
    setError(null);
    try {
      let latest = limits;
      for (const field of changed) {
        const r = await setRoomServiceLimitAction({ hotelId, key: field.key, value: parseField(field, draft[field.prop]) });
        if (!r.ok) {
          const message = r.error.fieldErrors?.value?.[0] ?? r.error.message;
          setError(`${field.label}: ${message}`);
          notify.error(`Oda servisi sınırı kaydedilemedi: ${message}`);
          // Whatever was saved before the failure is shown as saved.
          setLimits(latest);
          return;
        }
        latest = r.data;
      }
      setLimits(latest);
      setDraft(toDraft(latest));
      notify.success("Oda servisi sınırları kaydedildi.");
      setStatus(`Oda servisi sınırları kaydedildi`);
    } catch {
      setError("Oda servisi sınırları kaydedilemedi");
      notify.error("Oda servisi sınırları kaydedilemedi");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="xp-cp-main">
      <section className="xp-cp-section" aria-labelledby={`${id}-title`}>
        <h3 id={`${id}-title`} className="xp-cp-heading">
          Oda servisi sipariş sınırları
        </h3>
        <p className="xp-cp-note">
          Misafirin odadaki QR kodu okutarak gönderdiği oda servisi siparişlerine uygulanır. Değerler otele özeldir;
          kaydedilen değer hemen geçerli olur ve her değişiklik denetim kaydına yazılır.
        </p>
        {error ? (
          <p role="alert" className="xp-defs-error" style={{ padding: "4px 0" }}>
            {error}
          </p>
        ) : null}
        {hotelId && !loaded && !error ? <p className="xp-cp-note">Yükleniyor…</p> : null}
        {!hotelId ? <p className="xp-cp-note">Pencere başlığından bir otel seçin.</p> : null}
        {loaded ? (
          <form
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            {FIELDS.map((field) => {
              const bad = parseField(field, draft[field.prop]) === null;
              return (
                <div key={field.key} style={{ margin: "0 0 14px" }}>
                  <label htmlFor={`${id}-${field.prop}`} style={{ display: "block", fontWeight: 600, marginBottom: 4 }}>
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
                      value={draft[field.prop]}
                      disabled={busy}
                      aria-invalid={bad}
                      aria-describedby={`${id}-${field.prop}-help`}
                      onChange={(e) => setDraft({ ...draft, [field.prop]: e.target.value })}
                    />
                    <span>{field.unit}</span>
                  </div>
                  <p id={`${id}-${field.prop}-help`} className="xp-cp-note" style={{ margin: "4px 0 0" }}>
                    {field.help}
                  </p>
                  {bad ? (
                    <p role="alert" className="xp-defs-error" style={{ padding: "2px 0 0" }}>
                      {field.min} ile {field.max} arasında bir tam sayı yazın.
                    </p>
                  ) : null}
                </div>
              );
            })}
            <button
              type="submit"
              className="xp-button"
              style={{ ...TOUCH, minWidth: 120 }}
              disabled={busy || !dirty || invalid.length > 0}
            >
              {busy ? "Kaydediliyor…" : "Kaydet"}
            </button>
          </form>
        ) : null}
      </section>
    </div>
  );
}
