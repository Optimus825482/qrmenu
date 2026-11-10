"use client";

import { useEffect, useId, useState } from "react";
import { settingsScopesAction } from "@/modules/core/server/admin/actions/settingsAdmin";
import { loadManualEntryAction, saveManualEntryAction } from "@/modules/minibar/server/actions/manualRoomEntry";
import type { ManualEntryConfig } from "@/modules/minibar/server/manualRoomEntryAdmin";
import { confirm } from "../../confirm";
import { notify } from "../../notify";

type Draft = { enabled: boolean; floorIds: string[]; roomIds: string[] };

const toggle = (list: string[], id: string, on: boolean): string[] =>
  on ? (list.includes(id) ? list : [...list, id]) : list.filter((x) => x !== id);

/**
 * Denetim Masası → Minibar ve Kat → "Elle oda girişi": while QR is required, where a typed room number may
 * open the room check (whole hotel, chosen floors, chosen rooms). Hidden for roles that may not change it.
 */
export function ManualRoomEntryPanel({ setStatus }: { setStatus(text: string): void }) {
  const id = useId();
  const [hotels, setHotels] = useState<{ id: string; name: string }[] | null>(null);
  const [hotelId, setHotelId] = useState<string>("");
  const [config, setConfig] = useState<ManualEntryConfig | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [roomFilter, setRoomFilter] = useState("");

  useEffect(() => {
    let live = true;
    settingsScopesAction()
      .then((r) => {
        if (!live || !r.ok) return;
        setHotels(r.data.hotels);
        setHotelId(r.data.hotels[0]?.id ?? "");
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (!hotelId) return;
    let live = true;
    loadManualEntryAction({ hotelId })
      .then((r) => {
        if (!live) return;
        if (r.ok) {
          setConfig(r.data);
          setDraft({ enabled: r.data.enabled, floorIds: r.data.floorIds, roomIds: r.data.roomIds });
          setError(null);
        } else if (r.error.code === "FORBIDDEN") {
          setForbidden(true);
        } else {
          setError(r.error.message);
        }
      })
      .catch(() => live && setError("Elle oda girişi ayarı yüklenemedi"));
    return () => {
      live = false;
    };
  }, [hotelId]);

  if (forbidden || !hotels || hotels.length === 0) return null;

  const hotelName = hotels.find((h) => h.id === hotelId)?.name ?? "";
  const dirty =
    !!config &&
    !!draft &&
    (draft.enabled !== config.enabled ||
      JSON.stringify([...draft.floorIds].sort()) !== JSON.stringify([...config.floorIds].sort()) ||
      JSON.stringify([...draft.roomIds].sort()) !== JSON.stringify([...config.roomIds].sort()));

  const save = async () => {
    if (!draft) return;
    const ok = await confirm({
      title: "Elle oda girişi",
      message: `${hotelName} için elle oda girişi ayarı kaydedilsin mi? Elle yapılan her oda doğrulaması denetim kaydına ve günlük rapora yazılır.`,
      danger: true,
      confirmLabel: "Kaydet",
    });
    if (!ok) return;
    setBusy(true);
    setError(null);
    try {
      const r = await saveManualEntryAction({ hotelId, data: draft });
      if (r.ok) {
        setConfig(r.data);
        setDraft({ enabled: r.data.enabled, floorIds: r.data.floorIds, roomIds: r.data.roomIds });
        notify.success("Elle oda girişi ayarı kaydedildi.");
        setStatus(`${hotelName}: elle oda girişi ayarı kaydedildi`);
      } else {
        setError(r.error.message);
      }
    } finally {
      setBusy(false);
    }
  };

  const q = roomFilter.trim();
  return (
    <section className="xp-cp-section" aria-labelledby={`${id}-title`}>
      <h3 id={`${id}-title`} className="xp-cp-heading">
        Elle oda girişi (QR yerine oda numarası)
      </h3>
      <p className="xp-cp-note">
        Oda kontrolünde QR zorunluyken oda numarası yazılarak giriş varsayılan olarak kapalıdır. Burada tüm otel, seçilen
        katlar ya da seçilen odalar (örn. QR etiketi hasarlı oda) için açabilirsiniz. Elle yapılan her giriş denetim kaydına
        &ldquo;ELLE&rdquo; olarak yazılır ve günlük görev raporunda listelenir.
      </p>
      {hotels.length > 1 ? (
        <div className="xp-cp-color">
          <label htmlFor={`${id}-hotel`}>Otel</label>
          <select id={`${id}-hotel`} value={hotelId} disabled={busy} onChange={(e) => setHotelId(e.target.value)}>
            {hotels.map((h) => (
              <option key={h.id} value={h.id}>
                {h.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="xp-defs-error">
          {error}
        </p>
      ) : null}
      {!config || !draft ? (
        <p className="xp-cp-note">Yükleniyor…</p>
      ) : (
        <>
          {!config.requireQr ? (
            <p className="xp-cp-note">
              Bu otelde QR zorunluluğu kapalı; oda numarası ile giriş şu an herkese açıktır. Buradaki seçim QR zorunluluğu
              açıldığında uygulanır.
            </p>
          ) : null}
          <div className="xp-cp-choices" style={{ marginBottom: 10, alignItems: "center" }}>
            <label htmlFor={`${id}-all`} style={{ fontWeight: 600 }}>
              Tüm otelde elle oda girişine izin ver
            </label>
            <input
              id={`${id}-all`}
              type="checkbox"
              role="switch"
              checked={draft.enabled}
              disabled={busy}
              onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })}
            />
          </div>

          <fieldset disabled={busy || draft.enabled} style={{ border: 0, padding: 0, margin: "0 0 10px" }}>
            <legend style={{ fontWeight: 600, marginBottom: 4 }}>İzin verilen katlar</legend>
            {config.floors.length === 0 ? <p className="xp-cp-note">Bu otelde kat tanımı yok.</p> : null}
            <div className="xp-cp-choices">
              {config.floors.map((f) => (
                <label key={f.id}>
                  <input
                    type="checkbox"
                    checked={draft.floorIds.includes(f.id)}
                    onChange={(e) => setDraft({ ...draft, floorIds: toggle(draft.floorIds, f.id, e.target.checked) })}
                  />{" "}
                  {f.name}
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset disabled={busy || draft.enabled} style={{ border: 0, padding: 0, margin: "0 0 10px" }}>
            <legend style={{ fontWeight: 600, marginBottom: 4 }}>
              İzin verilen odalar ({draft.roomIds.length} seçili)
            </legend>
            <div className="xp-cp-color">
              <label htmlFor={`${id}-room-filter`}>Oda ara</label>
              <input
                id={`${id}-room-filter`}
                type="search"
                className="xp-system-input xp-system-input-sm"
                value={roomFilter}
                placeholder="Örn. 204"
                onChange={(e) => setRoomFilter(e.target.value)}
              />
            </div>
            {config.floors.map((f) => {
              const rooms = f.rooms.filter((r) => !q || r.number.includes(q));
              if (rooms.length === 0) return null;
              const floorOn = draft.floorIds.includes(f.id);
              const picked = rooms.filter((r) => draft.roomIds.includes(r.id)).length;
              return (
                <details key={f.id} open={q.length > 0} style={{ marginBottom: 4 }}>
                  <summary>
                    {f.name} — {rooms.length} oda{picked > 0 ? `, ${picked} seçili` : ""}
                    {floorOn ? " (kat tamamen izinli)" : ""}
                  </summary>
                  <div className="xp-cp-choices" style={{ padding: "4px 0 4px 16px" }}>
                    {rooms.map((r) => (
                      <label key={r.id}>
                        <input
                          type="checkbox"
                          checked={floorOn || draft.roomIds.includes(r.id)}
                          disabled={floorOn}
                          onChange={(e) => setDraft({ ...draft, roomIds: toggle(draft.roomIds, r.id, e.target.checked) })}
                        />{" "}
                        Oda {r.number}
                      </label>
                    ))}
                  </div>
                </details>
              );
            })}
          </fieldset>

          <button type="button" className="xp-button" disabled={busy || !dirty} onClick={() => void save()}>
            {busy ? "Kaydediliyor…" : "Kaydet"}
          </button>
        </>
      )}
    </section>
  );
}
